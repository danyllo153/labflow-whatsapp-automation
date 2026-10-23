"""APP-028: Admin → turnos, atividades fixas, estufas e faixas (07 v1.0, "10. Admin")."""

from datetime import date, datetime
from decimal import Decimal

import pytest

from labflow_api import rotas_turno
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"
HORARIOS = {"turnos": [{"id": 1, "inicio": "08:00", "fim": "16:00"}, {"id": 2, "inicio": "16:00", "fim": "00:00"}, {"id": 3, "inicio": "00:00", "fim": "08:00"}]}


@pytest.fixture
def admin(cliente, criar_pessoa, monkeypatch):
    monkeypatch.setattr(rotas_turno, "_agora", lambda con: datetime(2026, 10, 22, 9, tzinfo=FUSO))
    criar_pessoa(usuario="chefe.teste", cargo="Admin")
    assert cliente.post("/login", json={"usuario": "chefe.teste", "senha": SENHA}).status_code == 200
    return cliente


def test_so_o_admin_acessa(cliente, criar_pessoa):
    for cargo in ("Operador", "Consultor", "Coletor"):
        criar_pessoa(usuario=f"{cargo.lower()}.teste", cargo=cargo)
        cliente.cookies.clear()
        cliente.post("/login", json={"usuario": f"{cargo.lower()}.teste", "senha": SENHA})
        assert cliente.get("/admin/turnos").status_code == 403, cargo
        assert cliente.put("/admin/turnos/horarios", json=HORARIOS).status_code == 403, cargo
        assert cliente.post("/admin/turnos/atividades", json={"turno_id": 1, "texto": "x"}).status_code == 403, cargo
        assert cliente.put("/admin/turnos/estufas/3/faixa", json={"minimo": 35, "maximo": 37}).status_code == 403, cargo


def test_configuracao_traz_turnos_atividades_e_estufas(admin):
    c = admin.get("/admin/turnos").json()
    assert [(t["nome"], t["inicio"], t["fim"]) for t in c["turnos"]] == [("Manhã", "08:00", "16:00"), ("Tarde", "16:00", "00:00"), ("Madrugada", "00:00", "08:00")]
    assert len(c["atividades"]) == 26
    sexta = next(a for a in c["atividades"] if a["texto"] == "Coliformes demais fábricas")
    assert sexta["dias_semana"] == [5] and sexta["turno_id"] == 3
    assert [e["id"] for e in c["estufas"]] == [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]


def test_horarios_precisam_fechar_as_24_horas(admin):
    novo = {"turnos": [{"id": 1, "inicio": "07:00", "fim": "15:00"}, {"id": 2, "inicio": "15:00", "fim": "23:00"}, {"id": 3, "inicio": "23:00", "fim": "07:00"}]}
    r = admin.put("/admin/turnos/horarios", json=novo)
    assert r.status_code == 200, r.text
    assert [(t["inicio"], t["fim"]) for t in r.json()["turnos"]] == [("07:00", "15:00"), ("15:00", "23:00"), ("23:00", "07:00")]
    assert admin.get("/turno").json()["turnos"][0]["inicio"] == "07:00"  # as telas já usam os horários novos
    # buraco entre a Tarde e a Madrugada
    buraco = {"turnos": [{"id": 1, "inicio": "07:00", "fim": "15:00"}, {"id": 2, "inicio": "15:00", "fim": "22:00"}, {"id": 3, "inicio": "23:00", "fim": "07:00"}]}
    r = admin.put("/admin/turnos/horarios", json=buraco)
    assert r.status_code == 422 and "cobrir as 24 horas" in r.json()["detail"]
    # sobreposição
    assert admin.put("/admin/turnos/horarios", json={"turnos": [{"id": 1, "inicio": "07:00", "fim": "17:00"}, {"id": 2, "inicio": "15:00", "fim": "23:00"}, {"id": 3, "inicio": "23:00", "fim": "07:00"}]}).status_code == 422
    # faltou um turno, hora inválida
    assert admin.put("/admin/turnos/horarios", json={"turnos": HORARIOS["turnos"][:2]}).status_code == 422
    assert admin.put("/admin/turnos/horarios", json={"turnos": [{**HORARIOS["turnos"][0], "inicio": "25:00"}, *HORARIOS["turnos"][1:]]}).status_code == 422


def test_nova_atividade_vai_para_o_fim_da_lista_do_turno(admin):
    r = admin.post("/admin/turnos/atividades", json={"turno_id": 1, "texto": "  Conferir o freezer  ", "dias_semana": [5, 1, 5]})
    assert r.status_code == 201, r.text
    nova = [a for a in r.json()["atividades"] if a["turno_id"] == 1][-1]
    assert (nova["texto"], nova["dias_semana"], nova["ordem"], nova["ativa"]) == ("Conferir o freezer", [1, 5], 12, True)
    assert admin.post("/admin/turnos/atividades", json={"turno_id": 1, "texto": "   "}).status_code == 422
    assert admin.post("/admin/turnos/atividades", json={"turno_id": 1, "texto": "x", "dias_semana": [8]}).status_code == 422
    assert admin.post("/admin/turnos/atividades", json={"turno_id": 9, "texto": "x"}).status_code == 404


def test_mudar_texto_dias_e_desativar_nao_apaga(admin, conexao):
    c = admin.get("/admin/turnos").json()
    a = c["atividades"][0]
    r = admin.put(f"/admin/turnos/atividades/{a['id']}", json={"texto": "Leitura das placas", "dias_semana": [1, 2], "ativa": False})
    assert r.status_code == 200
    mudada = next(x for x in r.json()["atividades"] if x["id"] == a["id"])
    assert (mudada["texto"], mudada["dias_semana"], mudada["ativa"]) == ("Leitura das placas", [1, 2], False)
    assert conexao.execute("SELECT count(*) FROM app.atividades_fixas").fetchone()[0] == 26  # nada se apaga
    assert admin.put("/admin/turnos/atividades/999999", json={"texto": "x"}).status_code == 404


def test_atividade_desativada_some_da_lista_do_turno(admin, criar_pessoa):
    a = next(x for x in admin.get("/admin/turnos").json()["atividades"] if x["texto"] == "Planilhas")
    admin.put(f"/admin/turnos/atividades/{a['id']}", json={"texto": a["texto"], "ativa": False})
    textos = {x["texto"] for x in admin.get("/turno/atividades").json()["atividades"]}
    assert "Planilhas" not in textos and "Materiais" in textos


def test_mover_troca_de_lugar_com_a_vizinha(admin):
    manha = [a for a in admin.get("/admin/turnos").json()["atividades"] if a["turno_id"] == 1]
    segunda = manha[1]
    r = admin.post(f"/admin/turnos/atividades/{segunda['id']}/mover", json={"direcao": "cima"})
    nova = [a["texto"] for a in r.json()["atividades"] if a["turno_id"] == 1]
    assert nova[:2] == [manha[1]["texto"], manha[0]["texto"]] and nova[2:] == [a["texto"] for a in manha[2:]]
    # a primeira não sobe e a última não desce: nada muda
    r = admin.post(f"/admin/turnos/atividades/{segunda['id']}/mover", json={"direcao": "cima"})
    assert [a["texto"] for a in r.json()["atividades"] if a["turno_id"] == 1][0] == manha[1]["texto"]
    ultima = manha[-1]
    r = admin.post(f"/admin/turnos/atividades/{ultima['id']}/mover", json={"direcao": "baixo"})
    assert [a["texto"] for a in r.json()["atividades"] if a["turno_id"] == 1][-1] == ultima["texto"]
    assert admin.post(f"/admin/turnos/atividades/{ultima['id']}/mover", json={"direcao": "lado"}).status_code == 422


def test_nova_estufa_e_desativar(admin):
    assert admin.post("/admin/turnos/estufas", json={"id": 13}).status_code == 201
    assert admin.post("/admin/turnos/estufas", json={"id": 13}).status_code == 409
    assert 13 in [e["id"] for e in admin.get("/estufas").json()["estufas"]]
    r = admin.put("/admin/turnos/estufas/13", json={"ativa": False})
    assert next(e for e in r.json()["estufas"] if e["id"] == 13)["ativa"] is False
    assert 13 not in [e["id"] for e in admin.get("/estufas").json()["estufas"]]  # desativada: some da conferência
    assert admin.put("/admin/turnos/estufas/77", json={"ativa": False}).status_code == 404


def test_faixa_nova_encerra_a_anterior_e_guarda_o_historico(admin, conexao):
    conexao.execute("DELETE FROM app.faixas_estufa")
    r = admin.put("/admin/turnos/estufas/3/faixa", json={"minimo": 35.0, "maximo": 37.0, "desde": "2026-01-01"})
    assert r.status_code == 200, r.text
    r = admin.put("/admin/turnos/estufas/3/faixa", json={"minimo": 34.5, "maximo": 36.5})  # desde hoje (22/10)
    e = next(x for x in r.json()["estufas"] if x["id"] == 3)
    assert (Decimal(e["faixa"]["minimo"]), Decimal(e["faixa"]["maximo"]), e["faixa"]["desde"]) == (Decimal("34.5"), Decimal("36.5"), "2026-10-22")
    assert [(h["desde"], h["ate"]) for h in e["historico"]] == [("2026-10-22", None), ("2026-01-01", "2026-10-21")]
    # a estufa da tela de conferência usa a faixa vigente no dia do turno
    assert Decimal(next(x for x in admin.get("/estufas").json()["estufas"] if x["id"] == 3)["faixa"]["minimo"]) == Decimal("34.5")


def test_regras_da_faixa(admin):
    assert admin.put("/admin/turnos/estufas/3/faixa", json={"minimo": 37, "maximo": 35}).status_code == 422
    assert admin.put("/admin/turnos/estufas/6/faixa", json={"minimo": 35, "maximo": 37}).status_code == 422  # a 06 é auxiliar
    assert admin.put("/admin/turnos/estufas/99/faixa", json={"minimo": 35, "maximo": 37}).status_code == 404
    assert admin.put("/admin/turnos/estufas/3/faixa", json={"minimo": 35.55, "maximo": 37}).status_code == 422  # uma casa decimal


def test_mudar_a_faixa_no_mesmo_dia_corrige_em_vez_de_duplicar(admin, conexao):
    conexao.execute("DELETE FROM app.faixas_estufa")
    admin.put("/admin/turnos/estufas/3/faixa", json={"minimo": 35, "maximo": 37, "desde": "2026-10-22"})
    r = admin.put("/admin/turnos/estufas/3/faixa", json={"minimo": 34, "maximo": 38, "desde": "2026-10-22"})
    e = next(x for x in r.json()["estufas"] if x["id"] == 3)
    assert len(e["historico"]) == 1 and Decimal(e["faixa"]["minimo"]) == Decimal("34.0")
