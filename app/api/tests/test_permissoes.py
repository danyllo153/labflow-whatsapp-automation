"""APP-005: permissão por cargo conferida a cada chamada (07 v1.0, "Permissões"; 06, "Arquitetura")."""

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from labflow_api import permissoes
from labflow_api.dependencias import obter_conexao
from labflow_api.permissoes import exigir

SENHA = "Senha-de-teste-1"

# Tabela de permissões do 07 (v1.0), escrita de novo aqui de propósito: se alguém mudar o código, o teste pega.
ESPERADO = {
    "Admin": {"ver_paginas", "ver_turno", "imprimir_exportar", "entrar_no_turno", "encerrar_turno", "registrar_coleta",
              "registrar_analise", "corrigir_registro", "excluir_registro", "usar_assistente",
              "gerenciar_pessoas", "configurar_turnos"},
    "Operador": {"ver_paginas", "ver_turno", "imprimir_exportar", "entrar_no_turno", "encerrar_turno", "registrar_coleta",
                 "registrar_analise", "corrigir_registro", "excluir_registro", "usar_assistente"},
    "Consultor": {"ver_paginas", "ver_turno", "imprimir_exportar", "usar_assistente"},
    "Coletor": {"ver_paginas", "ver_turno", "imprimir_exportar", "entrar_no_turno", "registrar_coleta", "corrigir_registro",
                "excluir_registro", "usar_assistente"},
}


@pytest.mark.parametrize("cargo", list(ESPERADO))
def test_tabela_de_permissoes_igual_ao_07(cargo):
    assert set(permissoes.acoes_do_cargo(cargo)) == ESPERADO[cargo]


def test_cargo_desconhecido_nao_pode_nada():
    assert permissoes.acoes_do_cargo("Gerente") == []


def test_acao_desconhecida_e_erro_de_programacao():
    with pytest.raises(ValueError):
        exigir("apagar_tudo")


@pytest.fixture
def cliente_com_rotas(conexao):
    """App mínimo com duas rotas protegidas, usando a transação do teste e as permissões do labflow_app_web."""
    app = FastAPI()

    @app.get("/so-admin")
    def so_admin(p=Depends(exigir("gerenciar_pessoas"))):
        return {"ok": p.usuario}

    @app.get("/registrar-analise")
    def registrar_analise(p=Depends(exigir("registrar_analise"))):
        return {"ok": p.usuario}

    from labflow_api.rotas_login import roteador

    app.include_router(roteador)

    def conexao_do_teste():
        conexao.execute("SET ROLE labflow_app_web")
        try:
            yield conexao
        finally:
            conexao.execute("RESET ROLE")

    app.dependency_overrides[obter_conexao] = conexao_do_teste
    return TestClient(app, base_url="https://testserver")


@pytest.mark.parametrize(
    "cargo, admin, analise",
    [("Admin", 200, 200), ("Operador", 403, 200), ("Consultor", 403, 403), ("Coletor", 403, 403)],
)
def test_rotas_protegidas_por_cargo(cliente_com_rotas, criar_pessoa, cargo, admin, analise):
    criar_pessoa(cargo=cargo)
    assert cliente_com_rotas.post("/login", json={"usuario": "ana.teste", "senha": SENHA}).status_code == 200
    assert cliente_com_rotas.get("/so-admin").status_code == admin
    assert cliente_com_rotas.get("/registrar-analise").status_code == analise


def test_sem_login_da_401_e_nao_403(cliente_com_rotas):
    assert cliente_com_rotas.get("/so-admin").status_code == 401


def test_trocar_cargo_vale_na_chamada_seguinte(cliente_com_rotas, criar_pessoa, conexao):
    uid = criar_pessoa(cargo="Admin")
    cliente_com_rotas.post("/login", json={"usuario": "ana.teste", "senha": SENHA})
    assert cliente_com_rotas.get("/so-admin").status_code == 200
    conexao.execute("UPDATE usuarios SET cargo = 'Operador' WHERE id = %s", (uid,))
    assert cliente_com_rotas.get("/so-admin").status_code == 403
    assert set(cliente_com_rotas.get("/me").json()["pode"]) == ESPERADO["Operador"]
