"""APP-024: relatório do turno (07 v1.0, "4. Relatório do turno"; 08 A9).

Números conferidos contra as views bi.* do banco de teste. A hora "agora" é fixada em rotas_turno._agora.
"""

from datetime import date, datetime

import pytest

from labflow_api import rotas_turno
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"
MANHA, TARDE, MADRUGADA = 1, 2, 3


def em(dia: int, hora: int, minuto: int = 0, mes: int = 10) -> datetime:
    return datetime(2026, mes, dia, hora, minuto, tzinfo=FUSO)


@pytest.fixture
def agora(monkeypatch):
    def _fixar(quando: datetime):
        monkeypatch.setattr(rotas_turno, "_agora", lambda con: quando)

    return _fixar


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Operador", usuario=None):
        usuario = usuario or f"{cargo.lower()}.teste"
        uid = criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200
        return uid

    return _logar


def _grupo(corpo, tipo):
    return next(g for g in corpo["feito"] if g["tipo"] == tipo)


def test_drops_do_turno_batem_com_a_view_e_caem_no_turno_certo(cliente, logado, agora, conexao):
    # os drops fictícios do banco de teste foram concluídos em 18/10 às 07:00 (horário de Brasília): Madrugada de 18/10
    quando = conexao.execute("SELECT max(concluido_em) FROM bi.drops").fetchone()[0].astimezone(FUSO)
    agora(em(quando.day + 1, 12))
    logado()
    esperado = conexao.execute(
        """SELECT count(*) FROM bi.drops WHERE concluido_em >= %s AND concluido_em < %s
           AND (prevista IS NULL OR (concluido_em AT TIME ZONE 'America/Sao_Paulo')::date >= prevista)""",
        (em(quando.day, 0), em(quando.day, 8)),
    ).fetchone()[0]
    r = cliente.get("/turno/relatorio", params={"turno_id": MADRUGADA, "dia": f"2026-10-{quando.day}"})
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert (corpo["turno"], corpo["inicio"], corpo["fim"], corpo["em_andamento"]) == ("Madrugada", "00:00", "08:00", False)
    drops = _grupo(corpo, "Drops concluídos")
    assert drops["total"] == esperado > 0
    assert sum(p["n"] for p in drops["por_pessoa"]) == esperado
    # o mesmo dia, mas na Manhã: nenhum desses drops
    manha = cliente.get("/turno/relatorio", params={"turno_id": MANHA, "dia": f"2026-10-{quando.day}"}).json()
    assert _grupo(manha, "Drops concluídos")["total"] == 0


def test_adiantado_fica_em_linha_separada_e_nao_conta_como_feito(cliente, logado, agora, conexao):
    uid = logado()
    a, b = [i for (i,) in conexao.execute("SELECT id FROM analises WHERE pre_leitura_prevista IS NOT NULL ORDER BY id LIMIT 2")]
    # a: lida na Manhã de 21/10 e prevista só para 25/10 (adiantada); b: lida na Manhã de 21/10, prevista para 21/10 (no dia)
    # o gatilho do banco põe a hora de agora quando muda quem leu: primeiro quem, depois a hora que o teste quer
    for id_, hora, prevista in ((a, em(21, 10), date(2026, 10, 25)), (b, em(21, 11), date(2026, 10, 21))):
        conexao.execute("UPDATE analises SET pre_leitura_por = %s, pre_leitura_prevista = %s WHERE id = %s", (uid, prevista, id_))
        conexao.execute("UPDATE analises SET pre_leitura_em = %s WHERE id = %s", (hora, id_))
    agora(em(22, 9))
    corpo = cliente.get("/turno/relatorio", params={"turno_id": MANHA, "dia": "2026-10-21"}).json()
    leituras = _grupo(corpo, "Leituras de NFC")
    assert leituras["total"] == 1  # só a b
    assert corpo["adiantados"]["total"] == 1
    item = corpo["adiantados"]["itens"][0]
    assert item["tipo"] == "Leitura de NFC" and item["prevista"] == "2026-10-25"


def test_analistas_do_turno_com_entrada_saida_e_correcao(cliente, logado, agora):
    agora(em(22, 9))
    logado()
    cliente.post("/turno/entrar", json={"turno_id": MANHA})
    corpo = cliente.get("/turno/relatorio").json()  # padrão: o turno de quem está nele
    assert (corpo["turno"], corpo["dia"], corpo["em_andamento"]) == ("Manhã", "2026-10-22", True)
    assert [(a["entrada"], a["saida"], a["corrigido"]) for a in corpo["analistas"]] == [("09:00", None, False)]
    entrada_id = cliente.get("/turno").json()["no_turno"]["id"]
    cliente.put(f"/turno/entradas/{entrada_id}", json={"entrada": "08:00", "motivo": "Cheguei às 8h, esqueci de marcar"})
    assert cliente.get("/turno/relatorio").json()["analistas"][0]["corrigido"] is True


def test_atividades_feitas_e_nao_feitas(cliente, logado, agora):
    agora(em(22, 9))
    logado()
    lista = cliente.get("/turno/atividades").json()["atividades"]
    cliente.put(f"/turno/atividades/{lista[0]['id']}", json={"feito": True})
    cliente.put(f"/turno/atividades/{lista[1]['id']}", json={"feito": False})
    corpo = cliente.get("/turno/relatorio", params={"turno_id": MANHA, "dia": "2026-10-22"}).json()
    assert [a["texto"] for a in corpo["atividades_feitas"]] == [lista[0]["texto"]]
    assert lista[1]["texto"] in corpo["atividades_nao_feitas"] and lista[0]["texto"] not in corpo["atividades_nao_feitas"]
    assert len(corpo["atividades_nao_feitas"]) == 10
    assert _grupo(corpo, "Atividades do turno")["total"] == 1


def test_pendentes_batem_com_as_views(cliente, logado, agora, conexao):
    agora(em(22, 9))
    logado()
    vistas = ["bi.contagens", "bi.testes", "bi.drops", "bi.leituras_nfc", "bi.recebimento_nfc", "bi.desvios"]
    atrasados = sum(conexao.execute(f"SELECT count(*) FROM {v} WHERE situacao = 'Atrasado'").fetchone()[0] for v in vistas)
    pend = cliente.get("/turno/relatorio").json()["pendentes"]
    assert pend["atrasados"] == atrasados > 0
    assert pend["atrasados"] == sum(b["atrasados"] for b in pend["por_bloco"])
    assert pend["desvios_abertos"] == conexao.execute("SELECT count(*) FROM bi.desvios WHERE status <> 'Concluído'").fetchone()[0]


def test_turno_anterior_e_proximo(cliente, logado, agora):
    agora(em(22, 17))  # Tarde de 22/10
    logado()
    corpo = cliente.get("/turno/relatorio").json()
    assert (corpo["turno"], corpo["proximo"]) == ("Tarde", None)
    assert (corpo["anterior"]["turno"], corpo["anterior"]["dia"]) == ("Manhã", "2026-10-22")
    ant = cliente.get("/turno/relatorio", params={"turno_id": MADRUGADA, "dia": "2026-10-22"}).json()
    assert (ant["anterior"]["turno"], ant["anterior"]["dia"]) == ("Tarde", "2026-10-21")
    assert (ant["proximo"]["turno"], ant["proximo"]["dia"]) == ("Manhã", "2026-10-22")
    manha = cliente.get("/turno/relatorio", params={"turno_id": MANHA, "dia": "2026-10-22"}).json()
    assert (manha["proximo"]["turno"], manha["proximo"]["dia"]) == ("Tarde", "2026-10-22")


def test_turno_que_nao_comecou_da_422(cliente, logado, agora):
    agora(em(22, 9))
    logado()
    r = cliente.get("/turno/relatorio", params={"turno_id": TARDE, "dia": "2026-10-22"})
    assert r.status_code == 422 and "ainda não começou" in r.json()["detail"]
    assert cliente.get("/turno/relatorio", params={"turno_id": 9, "dia": "2026-10-22"}).status_code == 404


def test_escrever_so_os_campos_enviados_e_vazio_apaga(cliente, logado, agora, conexao):
    agora(em(22, 9))
    uid = logado()
    base = {"turno_id": MANHA, "dia": "2026-10-22"}
    r = cliente.put("/turno/relatorio", json={**base, "ocorrencias": "Falta de energia às 10h", "pendencias_escritas": "Refazer meio X"})
    assert r.status_code == 200, r.text
    assert r.json()["escritos"] == {"pendencias_escritas": "Refazer meio X", "esterilizacoes_pendentes": None, "ocorrencias": "Falta de energia às 10h"}
    r = cliente.put("/turno/relatorio", json={**base, "esterilizacoes_pendentes": "Ponteiras do ciclo 12", "ocorrencias": "  "})
    escritos = r.json()["escritos"]
    assert escritos["esterilizacoes_pendentes"] == "Ponteiras do ciclo 12"
    assert escritos["ocorrencias"] is None  # vazio apaga
    assert escritos["pendencias_escritas"] == "Refazer meio X"  # o que não veio ficou
    assert r.json()["atualizado_por"]
    assert conexao.execute("SELECT atualizado_por FROM app.relatorios_turno").fetchone()[0] == uid
    assert cliente.get("/turno/relatorio", params=base).json()["escritos"] == escritos


def test_escrever_tem_limite_de_tamanho(cliente, logado, agora):
    agora(em(22, 9))
    logado()
    r = cliente.put("/turno/relatorio", json={"turno_id": MANHA, "dia": "2026-10-22", "ocorrencias": "x" * 4001})
    assert r.status_code == 422


def test_relatorio_encerrado_e_so_leitura(cliente, logado, agora, conexao):
    agora(em(22, 17))
    uid = logado()
    conexao.execute(
        "INSERT INTO app.relatorios_turno (turno_id, dia, encerrado_por, encerrado_em) VALUES (%s, %s, %s, now())",
        (MANHA, date(2026, 10, 22), uid),
    )
    corpo = cliente.get("/turno/relatorio", params={"turno_id": MANHA, "dia": "2026-10-22"}).json()
    assert corpo["encerramento"]["encerrado"] is True and corpo["pode_editar"] is False
    r = cliente.put("/turno/relatorio", json={"turno_id": MANHA, "dia": "2026-10-22", "ocorrencias": "tarde demais"})
    assert r.status_code == 409


def test_consultor_ve_mas_nao_escreve(cliente, logado, agora):
    agora(em(22, 9))
    logado("Consultor")
    corpo = cliente.get("/turno/relatorio").json()
    assert corpo["pode_editar"] is False
    assert cliente.put("/turno/relatorio", json={"turno_id": MANHA, "dia": "2026-10-22", "ocorrencias": "x"}).status_code == 403


@pytest.mark.checkin
def test_sem_check_in_o_analista_nao_ve_o_relatorio(cliente, logado):
    logado()
    assert cliente.get("/turno/relatorio").status_code == 403
