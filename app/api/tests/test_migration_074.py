"""074: o app chama as funções do arquivo de contra-amostras da 105 (só as que recebem a pessoa)."""

import pytest


@pytest.mark.parametrize(
    "assinatura",
    [
        "arquivo_arquivar_recebimento(bigint, text, text, int[], int, date, boolean)",
        "arquivo_descartar(bigint, text, int, boolean)",
        "arquivo_caixa_recebimento_sugerida()",
    ],
)
def test_o_app_chama_a_funcao_do_arquivo(conexao, assinatura):
    assert conexao.execute("SELECT has_function_privilege('labflow_app_web', %s, 'EXECUTE')", (assinatura,)).fetchone()[0]


def test_o_app_nao_chama_as_do_bot(conexao):
    assert not conexao.execute(
        "SELECT has_function_privilege('labflow_app_web', 'arquivo_pelo_bot(text, jsonb, text)', 'EXECUTE')"
    ).fetchone()[0]
