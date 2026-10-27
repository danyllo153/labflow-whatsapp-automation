"""APP-023: atividades fixas do turno no Início, com Feito e Não feito (07 v1.0, "3. Início"; 08 A9).

23/10/2026 é sexta-feira, 24/10 é sábado. A hora "agora" é fixada com monkeypatch em rotas_turno._agora.
"""

from datetime import date, datetime

import pytest

from labflow_api import rotas_turno
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"


def em(dia: int, hora: int, minuto: int = 0) -> datetime:
    return datetime(2026, 10, dia, hora, minuto, tzinfo=FUSO)


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


def _por_texto(corpo, texto):
    return next(a for a in corpo["atividades"] if a["texto"] == texto)


def _marcadas_nao_feito(corpo):
    """As herdadas que alguém marcou como Não feito (as sem marcação do turno anterior vêm com quem = None)."""
    return [h for h in corpo["herdadas"] if h["quem"]]


def test_lista_do_turno_de_agora_na_ordem_do_cadastro(cliente, logado, agora):
    agora(em(22, 9))
    logado()
    corpo = cliente.get("/turno/atividades").json()
    assert (corpo["turno"], corpo["dia"], corpo["pode_marcar"]) == ("Manhã", "2026-10-22", True)
    assert corpo["total"] == 11 and corpo["feitas"] == 0 and _marcadas_nao_feito(corpo) == []
    assert [a["texto"] for a in corpo["atividades"]][:3] == ["Leitura de placa", "Planilhas", "Materiais"]
    assert all(a["estado"] is None and a["quem"] is None for a in corpo["atividades"])


def test_item_so_as_sextas_aparece_so_na_sexta(cliente, logado, agora):
    logado()
    agora(em(23, 1))  # Madrugada de sexta
    na_sexta = {a["texto"] for a in cliente.get("/turno/atividades").json()["atividades"]}
    agora(em(24, 1))  # Madrugada de sábado
    no_sabado = {a["texto"] for a in cliente.get("/turno/atividades").json()["atividades"]}
    assert "Coliformes demais fábricas" in na_sexta
    assert "Coliformes demais fábricas" not in no_sabado
    assert len(na_sexta) == 7 and len(no_sabado) == 6


def test_marcar_feito_grava_quem_e_quando_e_tocar_de_novo_desmarca(cliente, logado, agora, conexao):
    agora(em(22, 9))
    uid = logado()
    a = _por_texto(cliente.get("/turno/atividades").json(), "Planilhas")
    r = cliente.put(f"/turno/atividades/{a['id']}", json={"feito": True}).json()
    marcada = _por_texto(r, "Planilhas")
    assert marcada["estado"] == "feito" and marcada["quem"] and marcada["quando"]
    assert r["feitas"] == 1
    gravado = conexao.execute(
        "SELECT feito, marcado_por, turno_id, dia FROM app.atividades_feitas WHERE atividade_fixa_id = %s", (a["id"],)
    ).fetchall()
    assert gravado == [(True, uid, 1, date(2026, 10, 22))]

    r = cliente.put(f"/turno/atividades/{a['id']}", json={"feito": False}).json()  # muda para Não feito
    assert _por_texto(r, "Planilhas")["estado"] == "nao_feito" and r["feitas"] == 0
    r = cliente.put(f"/turno/atividades/{a['id']}", json={"feito": None}).json()  # desmarca
    assert _por_texto(r, "Planilhas")["estado"] is None
    assert conexao.execute("SELECT count(*) FROM app.atividades_feitas").fetchone()[0] == 0


def test_feito_aparece_no_cartao_feito_no_turno(cliente, logado, agora):
    agora(em(22, 9))
    logado()
    a = _por_texto(cliente.get("/turno/atividades").json(), "Materiais")
    cliente.put(f"/turno/atividades/{a['id']}", json={"feito": True})
    assert cliente.get("/turno").json()["feito_no_turno"]["atividades"] == 1


def test_nao_feito_vira_pendencia_herdada_do_turno_seguinte_ate_ser_feito(cliente, logado, agora):
    logado()
    agora(em(22, 15))
    a = _por_texto(cliente.get("/turno/atividades").json(), "Calibração")
    cliente.put(f"/turno/atividades/{a['id']}", json={"feito": False})

    agora(em(22, 17))  # Tarde: a Calibração da Manhã chega como pendência herdada
    tarde = cliente.get("/turno/atividades").json()
    assert tarde["turno"] == "Tarde"
    assert [(h["atividade_id"], h["texto"], h["turno"], h["dia"]) for h in _marcadas_nao_feito(tarde)] == [
        (a["id"], "Calibração", "Manhã", "2026-10-22")
    ]
    assert "Calibração" not in {x["texto"] for x in tarde["atividades"]}  # não é da Tarde

    r = cliente.put(f"/turno/atividades/{a['id']}", json={"feito": True}).json()  # marca Feito na herdada
    assert a["id"] not in {h["atividade_id"] for h in r["herdadas"]}
    agora(em(23, 1))  # Madrugada: já resolvida, não herda mais
    assert a["id"] not in {h["atividade_id"] for h in cliente.get("/turno/atividades").json()["herdadas"]}


def test_herdada_continua_nos_turnos_seguintes_se_ninguem_fez(cliente, logado, agora):
    logado()
    agora(em(22, 15))
    a = _por_texto(cliente.get("/turno/atividades").json(), "Reagentes")
    cliente.put(f"/turno/atividades/{a['id']}", json={"feito": False})
    for hora in (17, 23):
        agora(em(22, hora))
        assert [h["texto"] for h in _marcadas_nao_feito(cliente.get("/turno/atividades").json())] == ["Reagentes"]


def test_herdada_so_se_marca_como_feito(cliente, logado, agora):
    logado()
    agora(em(22, 15))
    a = _por_texto(cliente.get("/turno/atividades").json(), "Reagentes")
    cliente.put(f"/turno/atividades/{a['id']}", json={"feito": False})
    agora(em(22, 17))
    assert cliente.put(f"/turno/atividades/{a['id']}", json={"feito": False}).status_code == 422
    assert cliente.put(f"/turno/atividades/{a['id']}", json={"feito": None}).status_code == 422


def test_atividade_de_outro_turno_ou_dia_nao_se_marca(cliente, logado, agora):
    logado()
    agora(em(22, 9))
    da_tarde = cliente.get("/turno/atividades").json()  # Manhã
    agora(em(22, 17))
    tarde = cliente.get("/turno/atividades").json()
    id_tarde = tarde["atividades"][0]["id"]
    agora(em(22, 9))
    assert da_tarde["turno"] == "Manhã"
    assert cliente.put(f"/turno/atividades/{id_tarde}", json={"feito": True}).status_code == 404
    assert cliente.put("/turno/atividades/999999", json={"feito": True}).status_code == 404
    # "só às sextas" num sábado
    agora(em(23, 1))
    id_sexta = _por_texto(cliente.get("/turno/atividades").json(), "Coliformes demais fábricas")["id"]
    agora(em(24, 1))
    assert cliente.put(f"/turno/atividades/{id_sexta}", json={"feito": True}).status_code == 404


def test_consultor_ve_mas_nao_marca(cliente, logado, agora):
    agora(em(22, 9))
    logado("Consultor")
    corpo = cliente.get("/turno/atividades").json()
    assert corpo["pode_marcar"] is False
    assert cliente.put(f"/turno/atividades/{corpo['atividades'][0]['id']}", json={"feito": True}).status_code == 403


def test_quem_esta_no_turno_ve_a_lista_do_turno_dele(cliente, logado, agora):
    agora(em(22, 23, 30))  # a Madrugada de sexta começa daqui a 30 min (dentro das 2 h)
    logado()
    assert cliente.post("/turno/entrar", json={"turno_id": 3}).status_code == 200
    corpo = cliente.get("/turno/atividades").json()
    assert (corpo["turno"], corpo["dia"]) == ("Madrugada", "2026-10-23")
    assert "Coliformes demais fábricas" in {a["texto"] for a in corpo["atividades"]}  # a sexta que começou à meia-noite


@pytest.mark.checkin
def test_sem_check_in_o_operador_nao_ve_as_atividades(cliente, logado):
    logado()
    assert cliente.get("/turno/atividades").status_code == 403


def test_nao_marcada_ate_o_fim_do_turno_passa_como_nao_feita_so_para_o_seguinte(cliente, logado, agora):
    """25/10 (APP-065): a tela tem só a caixa de Feito; o que ninguém marcou passa para o turno seguinte."""
    logado()
    agora(em(22, 15))  # Manhã: marca só a Leitura de placa
    manha = cliente.get("/turno/atividades").json()
    feita = _por_texto(manha, "Leitura de placa")
    cliente.put(f"/turno/atividades/{feita['id']}", json={"feito": True})
    planilhas = _por_texto(manha, "Planilhas")

    agora(em(22, 17))  # Tarde: as não marcadas da Manhã chegam como herdadas, sem "quem"
    tarde = cliente.get("/turno/atividades").json()
    herdadas = {h["atividade_id"]: h for h in tarde["herdadas"]}
    assert feita["id"] not in herdadas
    assert herdadas[planilhas["id"]]["turno"] == "Manhã" and herdadas[planilhas["id"]]["quem"] is None
    r = cliente.put(f"/turno/atividades/{planilhas['id']}", json={"feito": True}).json()  # feita na Tarde
    assert planilhas["id"] not in {h["atividade_id"] for h in r["herdadas"]}

    agora(em(23, 1))  # Madrugada: a Manhã não é mais o turno anterior; nada da Manhã sem marcação
    assert all(h["turno"] != "Manhã" for h in cliente.get("/turno/atividades").json()["herdadas"])


def test_atividade_opcional_aparece_todo_dia_nao_conta_no_total_e_nao_passa_para_o_seguinte(cliente, logado, agora, conexao):
    """27/10 (081): a pessoa escolhe o dia em que faz a opcional; não feita, ela não vira pendência do turno seguinte."""
    conexao.execute("UPDATE app.atividades_fixas SET opcional = true, dias_semana = NULL WHERE texto = 'Planilhas' AND turno_id = 1")
    logado()
    agora(em(22, 15))  # Manhã de quinta
    manha = cliente.get("/turno/atividades").json()
    planilhas = _por_texto(manha, "Planilhas")
    assert planilhas["opcional"] and manha["total"] == 10
    assert manha["atividades"][-1]["texto"] == "Planilhas"  # as opcionais vêm no fim da lista
    cliente.put(f"/turno/atividades/{planilhas['id']}", json={"feito": False})  # marcada Não feito
    agora(em(22, 17))  # Tarde: nem a marcada Não feito nem a sem marcação chegam como herdada
    tarde = cliente.get("/turno/atividades").json()
    assert planilhas["id"] not in {h["atividade_id"] for h in tarde["herdadas"]}
    agora(em(24, 9))  # Manhã de sábado: continua aparecendo
    assert _por_texto(cliente.get("/turno/atividades").json(), "Planilhas")["opcional"]


def test_admin_marca_a_atividade_como_opcional(cliente, logado):
    logado("Admin")
    config = cliente.get("/admin/turnos").json()
    a = next(x for x in config["atividades"] if x["texto"] == "Materiais")
    r = cliente.put(f"/admin/turnos/atividades/{a['id']}", json={"texto": a["texto"], "dias_semana": [5], "ativa": True, "opcional": True})
    assert r.status_code == 200
    mudada = next(x for x in r.json()["atividades"] if x["id"] == a["id"])
    assert mudada["opcional"] and mudada["dias_semana"] is None  # na opcional, os dias da semana não valem
