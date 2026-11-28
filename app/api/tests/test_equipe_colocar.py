"""A3 (27/11): quem está no turno coloca os colegas nele e tira quem entrou por engano; só no PRÓPRIO turno aberto."""

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
def completa(cliente, criar_pessoa, agora):
    """Servidor com senha: cria a pessoa, entra com a senha e (se pedido) entra no turno."""

    class Cena:
        ids: dict[str, int] = {}

        def logar(self, usuario):
            cliente.cookies.clear()
            assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200

        def pessoa(self, usuario, cargo="Analista", turno_id=1):
            self.ids[usuario] = criar_pessoa(usuario=usuario, cargo=cargo)
            if turno_id:
                self.logar(usuario)
                assert cliente.post("/turno/entrar", json={"turno_id": turno_id}).status_code == 200
            return self.ids[usuario]

    Cena.ids = {}
    return Cena()


def nomes(equipe):
    return [p["nome"] for p in equipe["pessoas"]]


def test_colocar_e_tirar_colega(cliente, completa, agora):
    agora(em(22, 9, 0))
    completa.pessoa("bia.teste", turno_id=None)
    completa.pessoa("ana.teste")
    equipe = cliente.get("/turno/equipe").json()
    assert equipe["pode_colocar"] is True
    assert [d["nome"] for d in equipe["disponiveis"]] == ["bia.teste (teste)"]
    agora(em(22, 9, 30))
    r = cliente.post("/turno/equipe", json={"usuario_id": completa.ids["bia.teste"]})
    assert r.status_code == 200, r.text
    equipe = r.json()
    assert (equipe["no_turno"], equipe["disponiveis"]) == (2, [])
    bia = [p for p in equipe["pessoas"] if p["usuario_id"] == completa.ids["bia.teste"]][0]
    assert (bia["entrada"], bia["saida"], bia["sou_eu"]) == ("09:30", None, False)  # a hora do clique
    # colocar de novo não duplica
    assert cliente.post("/turno/equipe", json={"usuario_id": completa.ids["bia.teste"]}).json()["no_turno"] == 2
    agora(em(22, 10, 0))
    r = cliente.delete(f"/turno/equipe/{completa.ids['bia.teste']}")
    assert r.status_code == 200 and r.json()["no_turno"] == 1
    bia = [p for p in r.json()["pessoas"] if not p["sou_eu"]][0]
    assert bia["saida"] == "10:00"
    assert [d["nome"] for d in r.json()["disponiveis"]] == ["bia.teste (teste)"]  # volta a poder ser colocada


def test_nao_tira_a_si_mesmo(cliente, completa, agora):
    agora(em(22, 9, 0))
    completa.pessoa("ana.teste")
    r = cliente.delete(f"/turno/equipe/{completa.ids['ana.teste']}")
    assert r.status_code == 422 and "Sair do turno" in r.json()["detail"]


def test_quem_nao_esta_em_turno_nenhum_nao_mexe_na_equipe_403(cliente, completa, agora):
    agora(em(22, 9, 0))
    completa.pessoa("bia.teste", turno_id=None)
    completa.pessoa("ana.teste")
    completa.pessoa("caio.teste", turno_id=None)
    completa.logar("caio.teste")  # Caio ainda não entrou em turno nenhum
    assert cliente.post("/turno/equipe", json={"usuario_id": completa.ids["bia.teste"]}).status_code == 403
    assert cliente.delete(f"/turno/equipe/{completa.ids['ana.teste']}").status_code == 403
    assert cliente.get("/turno/equipe").json()["pode_colocar"] is False
    assert cliente.get("/turno/equipe").json()["disponiveis"] == []


def test_mexer_no_turno_de_outro_leva_403_idor(cliente, completa, agora, conexao):
    agora(em(22, 9, 0))
    completa.pessoa("ana.teste", turno_id=1)  # Manhã
    completa.pessoa("dani.teste", turno_id=None)
    # a Dani está num OUTRO turno (Tarde) do mesmo dia: entrada gravada direto
    conexao.execute(
        "INSERT INTO app.entradas_turno (usuario_id, turno_id, dia, entrada) VALUES (%s, 2, '2026-10-22', %s)",
        (completa.ids["dani.teste"], em(22, 9, 1)),
    )
    completa.logar("ana.teste")
    # tirar quem é de outro turno: 403 (e a entrada dela continua aberta)
    assert cliente.delete(f"/turno/equipe/{completa.ids['dani.teste']}").status_code == 403
    assert conexao.execute(
        "SELECT saida FROM app.entradas_turno WHERE usuario_id = %s", (completa.ids["dani.teste"],)
    ).fetchone()[0] is None
    # colocar quem ainda está noutro turno: recusado, sem mexer nele
    r = cliente.post("/turno/equipe", json={"usuario_id": completa.ids["dani.teste"]})
    assert r.status_code == 409 and "ainda está no turno" in r.json()["detail"]
    # a Dani, no turno dela, também não mexe na equipe da Ana (o turno vem da sessão, nunca da URL ou do corpo)
    completa.logar("dani.teste")
    assert cliente.delete(f"/turno/equipe/{completa.ids['ana.teste']}").status_code == 403
    assert cliente.get("/turno/equipe").json()["pessoas"][0]["nome"] == "dani.teste (teste)"


def test_consultor_nao_coloca_ninguem(cliente, completa, agora):
    agora(em(22, 9, 0))
    completa.pessoa("bia.teste", turno_id=None)
    completa.pessoa("cris.teste", cargo="Consultor", turno_id=None)
    completa.logar("cris.teste")
    assert cliente.post("/turno/equipe", json={"usuario_id": completa.ids["bia.teste"]}).status_code == 403
    assert cliente.get("/turno/equipe").json()["pode_colocar"] is False


def test_so_coloca_gente_da_lista(cliente, completa, agora, conexao):
    agora(em(22, 9, 0))
    completa.pessoa("ana.teste")
    bloqueada = completa.pessoa("bia.teste", turno_id=None)
    conexao.execute("UPDATE app.credenciais SET acesso_ativo = false WHERE usuario_id = %s", (bloqueada,))
    assert cliente.post("/turno/equipe", json={"usuario_id": bloqueada}).status_code == 422  # sem acesso
    assert cliente.post("/turno/equipe", json={"usuario_id": 99999999}).status_code == 422  # não existe
    assert cliente.post("/turno/equipe", json={"usuario_id": "x"}).status_code == 422
    assert cliente.get("/turno/equipe").json()["disponiveis"] == []  # a bloqueada não aparece para ser colocada


def test_sem_login_leva_401(cliente):
    assert cliente.post("/turno/equipe", json={"usuario_id": 1}).status_code == 401
    assert cliente.delete("/turno/equipe/1").status_code == 401


# ---------------------------------------------------------------- na Lite (sem senha, todos iguais)
def test_lite_colocar_colegas_e_idor(cliente_lite, conexao, registro_inicial, agora):
    agora(em(22, 9, 0))
    c = cliente_lite
    assert c.post("/entrar/novo", json={"nome": "Ana Souza"}).status_code == 201
    assert c.post("/admin/pessoas/por-nome", json={"nome": "Bia Lima"}).status_code == 201
    assert c.post("/admin/pessoas/por-nome", json={"nome": "Caio Mendes"}).status_code == 201
    ids = {n: i for i, n in conexao.execute("SELECT id, nome FROM usuarios WHERE nome IN ('Ana Souza', 'Bia Lima', 'Caio Mendes')")}
    # antes de entrar no turno ninguém mexe na equipe
    assert c.post("/turno/equipe", json={"usuario_id": ids["Bia Lima"]}).status_code == 403
    assert c.post("/turno/entrar", json={"turno_id": 1}).status_code == 200
    equipe = c.get("/turno/equipe").json()
    assert equipe["pode_colocar"] is True
    assert sorted(d["nome"] for d in equipe["disponiveis"]) == ["Bia Lima", "Caio Mendes"]  # sem o "Administrador"
    assert c.post("/turno/equipe", json={"usuario_id": ids["Bia Lima"]}).json()["no_turno"] == 2
    c.cookies.clear()
    assert c.post("/entrar/por-nome", json={"usuario": "caio.mendes"}).status_code == 200
    # Caio não está em turno: não mexe na equipe da Ana
    assert c.delete(f"/turno/equipe/{ids['Bia Lima']}").status_code == 403
    assert c.post("/turno/equipe", json={"usuario_id": ids["Ana Souza"]}).status_code == 403
