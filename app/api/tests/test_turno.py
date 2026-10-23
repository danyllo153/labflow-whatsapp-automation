"""APP-022: entrar e sair do turno (07 v1.0, "2. Entrar no turno"; 08 A2).

A hora "agora" é fixada em cada teste (monkeypatch em rotas_turno._agora), sempre em America/Sao_Paulo.
"""

from datetime import date, datetime

import pytest

from labflow_api import rotas_turno
from labflow_api.rotas_turno import FUSO, Turno, dia_do_turno, horario_no_turno, turno_agora

SENHA = "Senha-de-teste-1"
MANHA = Turno(1, "Manhã", datetime(2000, 1, 1, 8).time(), datetime(2000, 1, 1, 16).time())
TARDE = Turno(2, "Tarde", datetime(2000, 1, 1, 16).time(), datetime(2000, 1, 1, 0).time())
MADRUGADA = Turno(3, "Madrugada", datetime(2000, 1, 1, 0).time(), datetime(2000, 1, 1, 8).time())
TURNOS = [MANHA, TARDE, MADRUGADA]


def em(dia: int, hora: int, minuto: int = 0, mes: int = 10) -> datetime:
    return datetime(2026, mes, dia, hora, minuto, tzinfo=FUSO)


# --- regras de horário (sem banco) ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "agora, turno, dia",
    [
        (em(22, 7, 59), "Madrugada", date(2026, 10, 22)),
        (em(22, 8), "Manhã", date(2026, 10, 22)),
        (em(22, 16), "Tarde", date(2026, 10, 22)),
        (em(22, 23, 59), "Tarde", date(2026, 10, 22)),
        (em(23, 0), "Madrugada", date(2026, 10, 23)),  # a Madrugada conta no dia em que começa
    ],
)
def test_sugestao_pelo_horario(agora, turno, dia):
    t, d = turno_agora(TURNOS, agora)
    assert (t.nome, d) == (turno, dia)


def test_dia_do_turno_escolhido_fora_do_horario():
    assert dia_do_turno(MADRUGADA, em(22, 23, 30)) == date(2026, 10, 23)  # entra um pouco antes da meia-noite
    # a Tarde de 22/10 já acabou à meia-noite: às 00:30 ou 02:00 a Tarde escolhida é a de 23/10 (nunca uma que já terminou)
    assert dia_do_turno(TARDE, em(23, 0, 30)) == date(2026, 10, 23)
    assert dia_do_turno(TARDE, em(23, 2)) == date(2026, 10, 23)
    assert dia_do_turno(TARDE, em(22, 23, 59)) == date(2026, 10, 22)
    assert dia_do_turno(MANHA, em(22, 16)) == date(2026, 10, 23)
    assert dia_do_turno(MANHA, em(22, 7, 40)) == date(2026, 10, 22)


def test_horario_digitado_cai_no_dia_certo():
    assert horario_no_turno(TARDE, date(2026, 10, 22), "00:00") == em(23, 0)  # fim da Tarde: meia-noite
    assert horario_no_turno(TARDE, date(2026, 10, 22), "15:00") == em(22, 15)  # escala 15h–00h
    assert horario_no_turno(MADRUGADA, date(2026, 10, 23), "23:30") == em(22, 23, 30)  # chegou antes
    assert horario_no_turno(MANHA, date(2026, 10, 22), "08:40") == em(22, 8, 40)


# --- API ----------------------------------------------------------------------------------------------------------


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


def test_consultor_ve_mas_nao_entra_no_turno(cliente, logado, agora):
    agora(em(22, 9))
    logado("Consultor")
    corpo = cliente.get("/turno").json()
    assert corpo["pode_entrar"] is False
    assert corpo["sugestao"]["turno_id"] == 1
    assert [t["nome"] for t in corpo["turnos"]] == ["Manhã", "Tarde", "Madrugada"]
    assert cliente.post("/turno/entrar", json={"turno_id": 1}).status_code == 403
    assert cliente.post("/turno/sair", json={}).status_code == 403


def test_entrar_com_o_horario_padrao_e_sair(cliente, logado, agora, conexao):
    agora(em(23, 1))
    uid = logado()
    corpo = cliente.get("/turno").json()
    assert corpo["pode_entrar"] is True and corpo["no_turno"] is None
    assert corpo["sugestao"] == {"turno_id": 3, "dia": "2026-10-23"}

    r = cliente.post("/turno/entrar", json={"turno_id": 3})
    assert r.status_code == 200, r.text
    assert r.json() | {"id": 0} == {"id": 0, "turno_id": 3, "turno": "Madrugada", "dia": "2026-10-23", "entrada": "00:00", "saida": None}
    assert cliente.get("/turno").json()["no_turno"]["turno"] == "Madrugada"
    # tocar duas vezes não cria outra entrada
    assert cliente.post("/turno/entrar", json={"turno_id": 3}).json()["id"] == r.json()["id"]

    agora(em(23, 7, 50))
    saiu = cliente.post("/turno/sair", json={})
    assert saiu.status_code == 200 and saiu.json()["saida"] == "07:50"
    assert cliente.get("/turno").json()["no_turno"] is None
    assert cliente.post("/turno/sair", json={}).status_code == 404
    gravado = conexao.execute("SELECT count(*) FROM app.entradas_turno WHERE usuario_id = %s", (uid,)).fetchone()[0]
    assert gravado == 1


def test_madrugada_conta_no_dia_em_que_comecou(cliente, logado, agora, conexao):
    agora(em(22, 23, 40))  # chegou antes da meia-noite para a Madrugada
    uid = logado()
    r = cliente.post("/turno/entrar", json={"turno_id": 3, "entrada": "23:40"}).json()
    assert (r["dia"], r["entrada"]) == ("2026-10-23", "23:40")
    entrada = conexao.execute("SELECT entrada FROM app.entradas_turno WHERE usuario_id = %s", (uid,)).fetchone()[0]
    assert entrada == em(22, 23, 40)


def test_entrar_de_madrugada_na_tarde_fica_no_turno(cliente, logado, agora):
    # 23/10, ~02:00, no servidor: a Tarde com entrada 15:00 caía na Tarde de 22/10, que já tinha acabado, e fechava na hora
    agora(em(23, 2))
    logado()
    e = cliente.post("/turno/entrar", json={"turno_id": 2, "entrada": "15:00"}).json()
    assert (e["dia"], e["entrada"], e["saida"]) == ("2026-10-23", "15:00", None)
    assert cliente.get("/turno").json()["no_turno"]["id"] == e["id"]


def test_um_turno_aberto_por_pessoa(cliente, logado, agora):
    agora(em(22, 15))
    logado()
    assert cliente.post("/turno/entrar", json={"turno_id": 1}).status_code == 200
    r = cliente.post("/turno/entrar", json={"turno_id": 2})
    assert r.status_code == 409
    assert "Manhã de 22/10" in r.json()["detail"]


def test_esqueceu_de_sair_fecha_no_fim_do_turno(cliente, logado, agora, conexao):
    agora(em(22, 9))
    uid = logado()
    cliente.post("/turno/entrar", json={"turno_id": 1})
    agora(em(23, 9))  # no dia seguinte
    assert cliente.get("/turno").json()["no_turno"] is None
    saida = conexao.execute("SELECT saida FROM app.entradas_turno WHERE usuario_id = %s", (uid,)).fetchone()[0]
    assert saida == em(22, 16)
    assert cliente.post("/turno/entrar", json={"turno_id": 1}).status_code == 200


def test_saiu_sem_querer_e_entra_de_novo(cliente, logado, agora):
    agora(em(22, 10))
    logado()
    primeira = cliente.post("/turno/entrar", json={"turno_id": 1}).json()
    cliente.post("/turno/sair", json={})
    de_novo = cliente.post("/turno/entrar", json={"turno_id": 1, "entrada": "08:15"}).json()
    assert de_novo["id"] == primeira["id"]
    assert (de_novo["entrada"], de_novo["saida"]) == ("08:15", None)


def test_editar_o_proprio_horario(cliente, logado, agora):
    agora(em(22, 23))
    logado()
    e = cliente.post("/turno/entrar", json={"turno_id": 2, "entrada": "15:00"}).json()  # escala 15h–00h
    assert e["entrada"] == "15:00"
    assert cliente.put(f"/turno/entradas/{e['id']}", json={"entrada": "15:30"}).json()["entrada"] == "15:30"
    # a saída de quem ainda está no turno é pelo Sair do turno
    assert cliente.put(f"/turno/entradas/{e['id']}", json={"entrada": "15:30", "saida": "23:00"}).status_code == 422

    saiu = cliente.post("/turno/sair", json={"saida": "00:00"}).json()
    assert saiu["saida"] == "00:00"
    editado = cliente.put(f"/turno/entradas/{e['id']}", json={"entrada": "15:00", "saida": "23:45"})
    assert editado.status_code == 200 and editado.json()["saida"] == "23:45"
    errado = cliente.put(f"/turno/entradas/{e['id']}", json={"entrada": "15:00", "saida": "14:00"})
    assert errado.status_code == 422 and "depois da entrada" in errado.json()["detail"]
    assert cliente.put(f"/turno/entradas/{e['id']}", json={"entrada": "25:00"}).status_code == 422
    assert [r["id"] for r in cliente.get("/turno").json()["recentes"]] == [e["id"]]


def test_nao_edita_o_horario_de_outra_pessoa(cliente, logado, agora):
    agora(em(22, 10))
    logado(usuario="ana.teste")
    e = cliente.post("/turno/entrar", json={"turno_id": 1}).json()
    logado(usuario="bia.teste")
    assert cliente.put(f"/turno/entradas/{e['id']}", json={"entrada": "09:00"}).status_code == 404
    assert cliente.get("/turno").json()["recentes"] == []


def test_feito_no_turno_conta_pelas_views(cliente, logado, agora, conexao):
    # a última coleta fictícia do banco de teste foi gravada na Tarde de 19/10
    quando = conexao.execute("SELECT max(registrado_em) FROM bi.coletas").fetchone()[0].astimezone(FUSO)
    agora(quando)
    logado()
    turno, dia = turno_agora(TURNOS, quando)
    de, ate = rotas_turno.janela(turno, dia)
    coletas = conexao.execute(
        "SELECT count(*) FROM bi.coletas WHERE registrado_em >= %s AND registrado_em < %s", (de, ate)
    ).fetchone()[0]
    feito = cliente.get("/turno").json()["feito_no_turno"]
    assert (feito["turno"], feito["dia"]) == (turno.nome, dia.isoformat())
    assert feito["coletas"] == coletas > 0
    assert feito["total"] == feito["coletas"] + feito["leituras"] + feito["drops"] + feito["atividades"]


def test_turno_pede_login(cliente):
    assert cliente.get("/turno").status_code == 401
