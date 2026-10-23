"""APP-029: migration 056_app_funcoes_coletas (o app só ganha o direito de CHAMAR as funções do bot)."""

import psycopg
import pytest


def test_o_app_chama_as_tres_funcoes_mas_nao_a_interna(conexao):
    def pode(assinatura):
        return conexao.execute("SELECT has_function_privilege('labflow_app_web', %s, 'EXECUTE')", (assinatura,)).fetchone()[0]

    assert pode("corrigir_coleta(bigint, jsonb, bigint)")
    assert pode("excluir_coleta(bigint, bigint, text)")
    assert pode("recuperar_coleta(bigint, text, bigint)")
    assert not pode("coleta_exigir_permissao(bigint, bigint)")


def test_o_papel_do_app_nao_apaga_nem_muda_coleta_direto_na_tabela(conexao):
    conexao.execute("SET LOCAL ROLE labflow_app_web")
    for comando in ("DELETE FROM coletas", "UPDATE coletas SET tanque = 'X'"):
        conexao.execute("SAVEPOINT s")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conexao.execute(comando)
        conexao.execute("ROLLBACK TO SAVEPOINT s")
