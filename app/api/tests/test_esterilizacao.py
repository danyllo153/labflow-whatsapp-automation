"""APP-026: esterilização (07 v1.0, "7. Esterilização" e G4; 08 A8)."""

from datetime import datetime

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


def test_registrar_lista_o_do_turno_com_quem_e_hora(cliente, logado, agora, conexao):
    agora(em(22, 9, 30))
    uid = logado()
    vazio = cliente.get("/esterilizacao").json()
    assert (vazio["turno"], vazio["dia"], vazio["itens"], vazio["pode_registrar"]) == ("Manhã", "2026-10-22", [], True)
    assert vazio["tipos"] == ["Ponteira", "Meio", "Frasco", "Descarte", "Outro"]
    r = cliente.post("/esterilizacao", json={"tipo": "Ponteira", "ciclo": " 102 "})
    assert r.status_code == 201, r.text
    cliente.post("/esterilizacao", json={"tipo": "Meio", "ciclo": "103", "meio": "PDA"})
    itens = cliente.get("/esterilizacao").json()["itens"]
    assert [(i["tipo"], i["ciclo"], i["meio"]) for i in itens] == [("Meio", "103", "PDA"), ("Ponteira", "102", None)]  # a mais nova primeiro
    assert itens[0]["quem"] and itens[0]["quando"] and itens[0]["corrigida"] is False
    gravado = conexao.execute("SELECT feita_por, turno_id, dia FROM app.esterilizacoes ORDER BY id").fetchall()
    assert gravado == [(uid, 1, __import__("datetime").date(2026, 10, 22))] * 2


def test_regras_dos_campos(cliente, logado, agora):
    agora(em(22, 9))
    logado()
    assert cliente.post("/esterilizacao", json={"tipo": "Ponteira", "ciclo": "  "}).status_code == 422
    assert cliente.post("/esterilizacao", json={"tipo": "Autoclave", "ciclo": "1"}).status_code == 422
    r = cliente.post("/esterilizacao", json={"tipo": "Outro", "ciclo": "5"})
    assert r.status_code == 422 and "Descreva" in r.json()["detail"]
    assert cliente.post("/esterilizacao", json={"tipo": "Outro", "ciclo": "5", "descricao": "Vidraria do C4"}).status_code == 201
    # o nome do meio só vale no tipo Meio
    cliente.post("/esterilizacao", json={"tipo": "Frasco", "ciclo": "6", "meio": "PDA"})
    assert next(i for i in cliente.get("/esterilizacao").json()["itens"] if i["tipo"] == "Frasco")["meio"] is None


def test_corrigir_pede_motivo_e_guarda_o_que_estava_escrito(cliente, logado, agora):
    agora(em(22, 9))
    logado()
    item = cliente.post("/esterilizacao", json={"tipo": "Ponteira", "ciclo": "102"}).json()["itens"][0]
    url = f"/esterilizacao/{item['id']}"
    assert cliente.put(url, json={"tipo": "Ponteira", "ciclo": "120"}).status_code == 422  # sem motivo
    r = cliente.put(url, json={"tipo": "Ponteira", "ciclo": "120", "motivo": "Digitei o ciclo errado"})
    assert r.status_code == 200, r.text
    novo = r.json()["itens"][0]
    assert (novo["ciclo"], novo["corrigida"], novo["antes"], novo["motivo_correcao"]) == ("120", True, "Ponteira, ciclo 102", "Digitei o ciclo errado")


def test_excluir_nao_apaga_e_pede_motivo(cliente, logado, agora, conexao):
    agora(em(22, 9))
    uid = logado()
    item = cliente.post("/esterilizacao", json={"tipo": "Descarte", "ciclo": "7"}).json()["itens"][0]
    url = f"/esterilizacao/{item['id']}/excluir"
    assert cliente.post(url, json={"motivo": ""}).status_code == 422
    r = cliente.post(url, json={"motivo": "Registrei em duplicidade"})
    assert r.status_code == 200 and r.json()["itens"] == []
    linha = conexao.execute("SELECT excluida_por, motivo_exclusao FROM app.esterilizacoes WHERE id = %s", (item["id"],)).fetchone()
    assert linha == (uid, "Registrei em duplicidade")  # guardado, não apagado
    assert cliente.post(url, json={"motivo": "de novo, sem querer"}).status_code == 404  # já excluída


def test_so_mexe_no_que_e_do_proprio_turno(cliente, logado, agora):
    agora(em(22, 9))
    logado()
    item = cliente.post("/esterilizacao", json={"tipo": "Ponteira", "ciclo": "1"}).json()["itens"][0]
    agora(em(22, 17))  # Tarde: aquilo foi da Manhã
    assert cliente.get("/esterilizacao").json()["itens"] == []
    assert cliente.post(f"/esterilizacao/{item['id']}/excluir", json={"motivo": "não é deste turno"}).status_code == 404
    assert cliente.put(f"/esterilizacao/{item['id']}", json={"tipo": "Meio", "ciclo": "2", "motivo": "não é deste turno"}).status_code == 404


def test_consultor_ve_e_coletor_nao_registra(cliente, logado, agora):
    agora(em(22, 9))
    logado("Consultor")
    assert cliente.get("/esterilizacao").json()["pode_registrar"] is False
    assert cliente.post("/esterilizacao", json={"tipo": "Ponteira", "ciclo": "1"}).status_code == 403
    logado("Coletor")
    assert cliente.post("/esterilizacao", json={"tipo": "Ponteira", "ciclo": "1"}).status_code == 403


def test_grafico_g4_por_tipo_e_turno_na_semana(cliente, logado, agora):
    logado()
    for hora, tipo in ((9, "Ponteira"), (10, "Ponteira"), (11, "Meio")):
        agora(em(22, hora))
        cliente.post("/esterilizacao", json={"tipo": tipo, "ciclo": str(hora)})
    agora(em(22, 17))
    cliente.post("/esterilizacao", json={"tipo": "Frasco", "ciclo": "9"})
    agora(em(10, 9))  # fora da semana
    cliente.post("/esterilizacao", json={"tipo": "Descarte", "ciclo": "1"})
    agora(em(23, 12))
    g = cliente.get("/esterilizacao/grafico").json()
    assert (g["de"], g["ate"], g["total"]) == ("2026-10-17", "2026-10-23", 4)
    assert len(g["barras"]) == 15  # 3 turnos x 5 tipos, com zero
    soma = {(b["turno"], b["tipo"]): b["total"] for b in g["barras"]}
    assert soma[("Manhã", "Ponteira")] == 2 and soma[("Manhã", "Meio")] == 1 and soma[("Tarde", "Frasco")] == 1
    assert soma[("Madrugada", "Ponteira")] == 0
    amplo = cliente.get("/esterilizacao/grafico", params={"de": "2026-10-01", "ate": "2026-10-23"}).json()
    assert amplo["total"] == 5
    assert cliente.get("/esterilizacao/grafico", params={"de": "2026-01-01", "ate": "2026-10-23"}).status_code == 422


def test_aparece_no_relatorio_do_turno(cliente, logado, agora):
    agora(em(22, 9))
    logado()
    cliente.post("/esterilizacao", json={"tipo": "Meio", "ciclo": "103", "meio": "PDA"})
    rel = cliente.get("/turno/relatorio", params={"turno_id": 1, "dia": "2026-10-22"}).json()
    assert [(e["tipo"], e["ciclo"], e["meio"]) for e in rel["esterilizacoes"]] == [("Meio", "103", "PDA")]


@pytest.mark.checkin
def test_sem_check_in_nao_ve_nem_registra(cliente, logado):
    logado()
    assert cliente.get("/esterilizacao").status_code == 403
    assert cliente.post("/esterilizacao", json={"tipo": "Ponteira", "ciclo": "1"}).status_code == 403
