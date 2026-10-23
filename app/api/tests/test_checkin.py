"""Check-in (decidido em 23/10, APP-022b): Analista e Coletor só usam o resto do app depois de entrar no turno.

Aqui a hora é a do banco (sem fixar), porque a trava confere o turno aberto com o now() do banco.
"""

import pytest

pytestmark = pytest.mark.checkin

SENHA = "Senha-de-teste-1"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo):
        criar_pessoa(usuario=f"{cargo.lower()}.teste", cargo=cargo)
        assert cliente.post("/login", json={"usuario": f"{cargo.lower()}.teste", "senha": SENHA}).status_code == 200

    return _logar


def _turno_de_agora(cliente):
    return cliente.get("/turno").json()["sugestao"]["turno_id"]


@pytest.mark.parametrize("cargo", ["Analista", "Coletor"])
def test_sem_entrar_no_turno_so_abre_a_tela_turno(cliente, logado, cargo):
    logado(cargo)
    estado = cliente.get("/turno")
    assert estado.status_code == 200 and estado.json()["checkin_obrigatorio"] is True
    for rota in ("/pendencias-hoje", "/paginas/coletas", "/paginas/visao-geral"):
        r = cliente.get(rota)
        assert r.status_code == 403, rota
        assert r.json()["detail"] == "Entre no turno antes de continuar."
    assert cliente.get("/me").status_code == 200  # quem eu sou continua aberto

    assert cliente.post("/turno/entrar", json={"turno_id": _turno_de_agora(cliente)}).status_code == 200
    assert cliente.get("/pendencias-hoje").status_code == 200
    assert cliente.get("/paginas/coletas").status_code == 200

    assert cliente.post("/turno/sair", json={}).status_code == 200
    assert cliente.get("/pendencias-hoje").status_code == 403  # saiu do turno: trava de novo


@pytest.mark.parametrize("cargo", ["Admin", "Consultor"])
def test_admin_e_consultor_nao_precisam_de_checkin(cliente, logado, cargo):
    logado(cargo)
    assert cliente.get("/turno").json()["checkin_obrigatorio"] is False
    assert cliente.get("/pendencias-hoje").status_code == 200


def test_turno_esquecido_aberto_nao_libera(cliente, logado, conexao):
    # entrada aberta de um turno que já terminou (esqueceu de sair ontem) não conta como check-in
    logado("Analista")
    conexao.execute(
        "INSERT INTO app.entradas_turno (usuario_id, turno_id, dia, entrada, entrada_registrada) "
        "SELECT usuario_id, 1, CURRENT_DATE - 2, now() - interval '2 days', now() - interval '2 days' "
        "FROM app.credenciais WHERE usuario = 'operador.teste'"
    )
    assert cliente.get("/pendencias-hoje").status_code == 403
