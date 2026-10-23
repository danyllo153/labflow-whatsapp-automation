"""APP-029: corrigir, excluir (arquiva) e recuperar coleta pelo app, usando as funções do bot (PB4: 033/034, liberadas na 056)."""

from datetime import date

import pytest

SENHA = "Senha-de-teste-1"


@pytest.fixture
def pessoa_logada(cliente, criar_pessoa):
    def _como(cargo, usuario=None):
        usuario = usuario or f"{cargo.lower()}.teste"
        uid = criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200
        return uid

    return _como


@pytest.fixture
def nova_coleta(conexao):
    """Coleta de terra fictícia, sem análise, drop concluído nem TAB (pode ser corrigida e excluída)."""

    def _criar(registrada_por, tanque="T91", data=date(2026, 10, 20), origem="terra", navio_id=None):
        return conexao.execute(
            "INSERT INTO coletas (origem, navio_id, tanque, data_coleta, registrado_por, coletado_por) VALUES (%s, %s, %s, %s, %s, 'Fulano') RETURNING id",
            (origem, navio_id, tanque, data, registrada_por),
        ).fetchone()[0]

    return _criar


def test_detalhe_da_coleta_com_o_que_a_trava(cliente, pessoa_logada, nova_coleta, conexao):
    uid = pessoa_logada("Operador")
    cid = nova_coleta(uid)
    r = cliente.get(f"/coletas/{cid}")
    assert r.status_code == 200, r.text
    c = r.json()
    assert (c["tanque"], c["origem"], c["data_coleta"], c["coletado_por"]) == ("T91", "Terra", "2026-10-20", "Fulano")
    assert (c["com_analise"], c["com_drop_concluido"], c["com_tab"], c["navios"]) == (False, False, False, [])
    comanalise = conexao.execute("SELECT coleta_id FROM analises LIMIT 1").fetchone()
    assert cliente.get(f"/coletas/{comanalise[0]}").json()["com_analise"] is True
    assert cliente.get("/coletas/999999").status_code == 404


def test_corrigir_so_o_que_veio_e_vai_para_o_historico(cliente, pessoa_logada, nova_coleta, conexao):
    uid = pessoa_logada("Operador")
    cid = nova_coleta(uid)
    r = cliente.put(f"/coletas/{cid}", json={"tanque": " t92 ", "coletado_por": "Beltrano"})
    assert r.status_code == 200, r.text
    assert (r.json()["tanque"], r.json()["coletado_por"], r.json()["data_coleta"]) == ("T92", "Beltrano", "2026-10-20")
    h = conexao.execute("SELECT tipo, quem FROM historico_alteracoes WHERE tabela = 'coletas' AND registro_id = %s", (cid,)).fetchall()
    assert h == [("corrigido", uid)]
    r = cliente.put(f"/coletas/{cid}", json={"data_coleta": "2026-10-19"})
    assert r.status_code == 200 and r.json()["data_coleta"] == "2026-10-19"


def test_corrigir_recusado_em_portugues(cliente, pessoa_logada, nova_coleta):
    uid = pessoa_logada("Operador")
    a, b = nova_coleta(uid, "T91"), nova_coleta(uid, "T92")
    r = cliente.put(f"/coletas/{a}", json={"tanque": "T92"})
    assert r.status_code == 422 and "Já existe uma coleta desse tanque nessa data." in r.json()["detail"]
    r = cliente.put(f"/coletas/{a}", json={})
    assert r.status_code == 422 and "Diga o que corrigir" in r.json()["detail"]
    r = cliente.put(f"/coletas/{a}", json={"tanque": "T91"})
    assert r.status_code == 422 and "Nada mudou" in r.json()["detail"]
    del b


def test_excluir_arquiva_e_recusa_o_que_tem_analise(cliente, pessoa_logada, nova_coleta, conexao):
    uid = pessoa_logada("Operador")
    cid = nova_coleta(uid)
    r = cliente.post(f"/coletas/{cid}/excluir", json={})
    assert r.status_code == 200, r.text
    assert conexao.execute("SELECT count(*) FROM coletas WHERE id = %s", (cid,)).fetchone()[0] == 0
    arquivada = conexao.execute("SELECT excluido_por, dados->'coleta'->>'tanque' FROM registros_excluidos WHERE registro_id = %s", (cid,)).fetchone()
    assert arquivada == (uid, "T91")  # guardada, não apagada
    assert cliente.get(f"/coletas/{cid}").status_code == 404
    comanalise = conexao.execute("SELECT coleta_id FROM analises LIMIT 1").fetchone()[0]
    r = cliente.post(f"/coletas/{comanalise}/excluir", json={"motivo": "teste"})
    assert r.status_code == 422 and "análises" in r.json()["detail"]


def test_coletor_so_mexe_na_propria_coleta(cliente, pessoa_logada, nova_coleta):
    dono = pessoa_logada("Coletor", "coletor.dono")
    minha, alheia = nova_coleta(dono, "T91"), nova_coleta(None, "T92")
    assert cliente.get(f"/coletas/{alheia}").status_code == 404  # nem vê
    assert cliente.put(f"/coletas/{alheia}", json={"tanque": "T93"}).status_code == 404
    assert cliente.post(f"/coletas/{alheia}/excluir", json={}).status_code == 404
    assert cliente.put(f"/coletas/{minha}", json={"tanque": "T94"}).status_code == 200
    assert cliente.post(f"/coletas/{minha}/excluir", json={}).status_code == 200


def test_consultor_ve_mas_nao_corrige_nem_exclui(cliente, pessoa_logada, nova_coleta):
    uid = pessoa_logada("Admin", "chefe.teste")
    cid = nova_coleta(uid)
    pessoa_logada("Consultor")
    assert cliente.get(f"/coletas/{cid}").status_code == 200
    assert cliente.put(f"/coletas/{cid}", json={"tanque": "T95"}).status_code == 403
    assert cliente.post(f"/coletas/{cid}/excluir", json={}).status_code == 403


def test_admin_ve_as_excluidas_e_recupera_com_motivo(cliente, pessoa_logada, nova_coleta, conexao):
    pessoa_logada("Admin", "chefe.teste")
    uid = conexao.execute("SELECT id FROM usuarios WHERE cargo = 'Admin' ORDER BY id DESC LIMIT 1").fetchone()[0]
    cid = nova_coleta(uid)
    cliente.post(f"/coletas/{cid}/excluir", json={"motivo": "Registrei em duplicidade"})
    lista = cliente.get("/coletas/excluidas").json()
    achada = next(e for e in lista if e["coleta_id"] == cid)
    assert (achada["tanque"], achada["origem"], achada["motivo"]) == ("T91", "terra", "Registrei em duplicidade")
    assert cliente.post(f"/coletas/excluidas/{achada['id']}/recuperar", json={"motivo": ""}).status_code == 422
    r = cliente.post(f"/coletas/excluidas/{achada['id']}/recuperar", json={"motivo": "Foi engano"})
    assert r.status_code == 200, r.text
    assert r.json()["coleta_id"] == cid  # volta com o mesmo número
    assert not [e for e in cliente.get("/coletas/excluidas").json() if e["coleta_id"] == cid]
    assert cliente.post(f"/coletas/excluidas/{achada['id']}/recuperar", json={"motivo": "de novo"}).status_code == 422


def test_so_o_admin_ve_e_recupera_as_excluidas(cliente, pessoa_logada):
    for cargo in ("Operador", "Consultor", "Coletor"):
        pessoa_logada(cargo)
        assert cliente.get("/coletas/excluidas").status_code == 403, cargo
        assert cliente.post("/coletas/excluidas/1/recuperar", json={"motivo": "teste teste"}).status_code == 403, cargo


@pytest.mark.checkin
def test_sem_check_in_o_analista_nao_mexe(cliente, pessoa_logada, nova_coleta):
    uid = pessoa_logada("Operador")
    cid = nova_coleta(uid)
    assert cliente.get(f"/coletas/{cid}").status_code == 403
    assert cliente.put(f"/coletas/{cid}", json={"tanque": "T9"}).status_code == 403
