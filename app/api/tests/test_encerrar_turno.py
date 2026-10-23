"""APP-025: encerrar o turno, encerramento automático, reabrir com motivo e pendências herdadas (07 v1.0, "4"; 08 A10)."""

from datetime import datetime

import pytest

from labflow_api import rotas_turno
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"
MANHA, TARDE, MADRUGADA = 1, 2, 3
DIA = "2026-10-22"


def em(dia: int, hora: int, minuto: int = 0) -> datetime:
    return datetime(2026, 10, dia, hora, minuto, tzinfo=FUSO)


@pytest.fixture
def agora(monkeypatch):
    def _fixar(quando: datetime):
        monkeypatch.setattr(rotas_turno, "_agora", lambda con: quando)

    return _fixar


@pytest.fixture
def pessoas(cliente, criar_pessoa):
    """`entrar_como("ana")` cria a pessoa (uma vez) e passa a falar como ela."""
    criadas: dict[str, int] = {}

    def _como(usuario: str, cargo: str = "Operador") -> int:
        if usuario not in criadas:
            criadas[usuario] = criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200
        return criadas[usuario]

    return _como


def _encerrar(cliente, turno=MANHA, dia=DIA, **extra):
    return cliente.post("/turno/relatorio/encerrar", json={"turno_id": turno, "dia": dia, **extra})


def test_a_ultima_pessoa_encerra_e_o_relatorio_vira_so_leitura(cliente, pessoas, agora, conexao):
    agora(em(22, 9))
    uid = pessoas("ana")
    cliente.post("/turno/entrar", json={"turno_id": MANHA})
    cliente.put("/turno/relatorio", json={"turno_id": MANHA, "dia": DIA, "pendencias_escritas": "Refazer meio X\nConferir lote 4"})
    agora(em(22, 15, 50))
    r = _encerrar(cliente)
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["encerramento"]["encerrado"] is True and corpo["encerramento"]["automatico"] is False
    assert corpo["encerramento"]["por"] and corpo["pode_editar"] is False and corpo["pode_encerrar"] is False
    assert corpo["adiante"]["turno"] == "Tarde" and corpo["adiante"]["recados"] == 2
    # a saída dela é registrada junto
    assert conexao.execute("SELECT saida IS NOT NULL FROM app.entradas_turno WHERE usuario_id = %s", (uid,)).fetchone()[0]
    assert cliente.get("/turno").json()["no_turno"] is None
    # encerrado = só leitura; não encerra duas vezes
    assert cliente.put("/turno/relatorio", json={"turno_id": MANHA, "dia": DIA, "ocorrencias": "tarde"}).status_code == 409
    assert _encerrar(cliente).status_code == 409


def test_nao_encerra_enquanto_outra_pessoa_ainda_esta_no_turno(cliente, pessoas, agora):
    agora(em(22, 9))
    pessoas("ana")
    cliente.post("/turno/entrar", json={"turno_id": MANHA})
    pessoas("bruno")
    cliente.post("/turno/entrar", json={"turno_id": MANHA})
    agora(em(22, 15, 50))
    r = _encerrar(cliente)  # o Bruno tenta, a Ana ainda está
    assert r.status_code == 409
    assert "Ainda estão no turno" in r.json()["detail"] and "ana" in r.json()["detail"]
    pessoas("ana")
    assert cliente.post("/turno/sair", json={}).status_code == 200
    pessoas("bruno")
    assert _encerrar(cliente).status_code == 200


def test_admin_pode_forcar_a_saida_dos_outros(cliente, pessoas, agora, conexao):
    agora(em(22, 9))
    pessoas("ana")
    cliente.post("/turno/entrar", json={"turno_id": MANHA})
    pessoas("chefe", "Admin")
    cliente.post("/turno/entrar", json={"turno_id": MANHA})
    agora(em(22, 15, 59))
    assert _encerrar(cliente).status_code == 409
    r = _encerrar(cliente, forcar=True)
    assert r.status_code == 200
    assert conexao.execute("SELECT count(*) FROM app.entradas_turno WHERE saida IS NULL").fetchone()[0] == 0
    assert all(a["saida"] for a in r.json()["analistas"])


def test_quem_nao_esta_no_turno_nao_encerra(cliente, pessoas, agora):
    agora(em(22, 9))
    pessoas("ana")
    assert _encerrar(cliente).status_code == 403
    pessoas("leitor", "Consultor")
    assert _encerrar(cliente).status_code == 403
    assert _encerrar(cliente, turno=TARDE).status_code in (403, 422)  # turno que nem começou


def test_sem_encerrar_o_turno_se_encerra_sozinho_quando_o_proximo_comeca(cliente, pessoas, agora, conexao):
    agora(em(22, 9))
    uid = pessoas("ana")
    cliente.post("/turno/entrar", json={"turno_id": MANHA})
    agora(em(22, 17))  # a Tarde já começou e a Ana esqueceu de sair e de encerrar
    corpo = cliente.get("/turno/relatorio", params={"turno_id": MANHA, "dia": DIA}).json()
    assert corpo["encerramento"] == {"encerrado": True, "por": None, "quando": "16:00", "automatico": True}
    assert corpo["pode_editar"] is False
    assert corpo["analistas"][0]["saida"] == "16:00"
    assert conexao.execute("SELECT saida_registrada FROM app.entradas_turno WHERE usuario_id = %s", (uid,)).fetchone()[0] == em(22, 16)
    # o turno de agora continua aberto
    assert cliente.get("/turno/relatorio").json()["encerramento"]["encerrado"] is False


def test_so_o_admin_reabre_e_com_motivo_e_nao_fecha_sozinho_de_novo(cliente, pessoas, agora):
    agora(em(22, 17))
    pessoas("ana")
    base = {"turno_id": MANHA, "dia": DIA}
    assert cliente.get("/turno/relatorio", params=base).json()["encerramento"]["automatico"] is True
    assert cliente.post("/turno/relatorio/reabrir", json={**base, "motivo": "esqueci um recado"}).status_code == 403
    pessoas("chefe", "Admin")
    assert cliente.post("/turno/relatorio/reabrir", json={**base, "motivo": ""}).status_code == 422
    assert cliente.post("/turno/relatorio/reabrir", json={**base, "motivo": "Faltou registrar uma ocorrência"}).status_code == 200
    corpo = cliente.get("/turno/relatorio", params=base).json()
    assert corpo["encerramento"]["encerrado"] is False  # não se fecha sozinho de novo
    assert corpo["reaberto"].startswith("Reaberto por ") and "Faltou registrar uma ocorrência" in corpo["reaberto"]
    assert corpo["pode_editar"] is True
    # reaberto: o Admin escreve e encerra de novo, mesmo já fora do horário do turno
    assert cliente.put("/turno/relatorio", json={**base, "ocorrencias": "Queda de energia às 11h"}).status_code == 200
    assert _encerrar(cliente).status_code == 200
    # não reabre o que está aberto
    assert cliente.post("/turno/relatorio/reabrir", json={**base, "motivo": "outra vez, só testando"}).status_code == 200
    assert cliente.post("/turno/relatorio/reabrir", json={**base, "motivo": "e mais uma vez!"}).status_code == 409


def test_pendencias_escritas_viram_recados_do_turno_seguinte(cliente, pessoas, agora):
    agora(em(22, 9))
    pessoas("ana")
    cliente.post("/turno/entrar", json={"turno_id": MANHA})
    cliente.put("/turno/relatorio", json={"turno_id": MANHA, "dia": DIA, "pendencias_escritas": "Refazer meio X\n\nConferir lote 4"})
    agora(em(22, 15, 59))
    assert _encerrar(cliente).status_code == 200

    pessoas("bruno")
    agora(em(22, 17))  # Tarde
    cliente.post("/turno/entrar", json={"turno_id": TARDE})
    corpo = cliente.get("/turno/atividades").json()
    assert [(r["texto"], r["turno"], r["dia"]) for r in corpo["recados"]] == [
        ("Refazer meio X", "Manhã", DIA),
        ("Conferir lote 4", "Manhã", DIA),
    ]
    assert corpo["recados"][0]["por"]  # quem encerrou o turno anterior
    feito = cliente.put("/turno/atividades/recados/feito", json={"texto": "Refazer meio X"})
    assert feito.status_code == 200
    assert [r["texto"] for r in feito.json()["recados"]] == ["Conferir lote 4"]
    assert cliente.put("/turno/atividades/recados/feito", json={"texto": "Texto que ninguém escreveu"}).status_code == 404
    # o recado não passa do turno seguinte
    agora(em(23, 1))
    cliente.post("/turno/sair", json={})
    cliente.post("/turno/entrar", json={"turno_id": MADRUGADA})
    assert cliente.get("/turno/atividades").json()["recados"] == []


@pytest.mark.checkin
def test_depois_de_encerrar_o_analista_volta_ao_check_in(cliente, pessoas):
    # sem fixar a hora: a trava do check-in confere o turno com o relógio do banco
    pessoas("ana")
    turno = cliente.get("/turno").json()["sugestao"]
    assert cliente.post("/turno/entrar", json={"turno_id": turno["turno_id"]}).status_code == 200
    assert cliente.get("/pendencias-hoje").status_code == 200
    assert _encerrar(cliente, turno=turno["turno_id"], dia=turno["dia"]).status_code == 200
    assert cliente.get("/pendencias-hoje").status_code == 403


def test_quem_pode_encerrar_e_reabrir_aparece_no_relatorio(cliente, pessoas, agora):
    agora(em(22, 9))
    pessoas("ana")
    base = {"turno_id": MANHA, "dia": DIA}
    assert cliente.get("/turno/relatorio", params=base).json()["pode_encerrar"] is False  # ainda não entrou
    cliente.post("/turno/entrar", json={"turno_id": MANHA})
    corpo = cliente.get("/turno/relatorio", params=base).json()
    assert (corpo["pode_encerrar"], corpo["pode_reabrir"]) == (True, False)
    pessoas("chefe", "Admin")
    assert cliente.get("/turno/relatorio", params=base).json()["pode_encerrar"] is True  # o Admin pode, mesmo fora do turno
    pessoas("leitor", "Consultor")
    assert cliente.get("/turno/relatorio", params=base).json()["pode_encerrar"] is False
    agora(em(22, 17))
    pessoas("chefe", "Admin")
    assert cliente.get("/turno/relatorio", params=base).json()["pode_reabrir"] is True  # encerrado sozinho
