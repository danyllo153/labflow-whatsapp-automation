"""069: o app chama as funções da Fase E do bot (042 a 047), e só as que recebem a pessoa; as "..._pelo_bot" não."""

import pytest

FUNCOES_DO_APP = [
    "registrar_coleta(bigint, text, text, text[], date, text, boolean)",
    "registrar_analise(bigint, text, text[], text, date, boolean)",
    "concluir_leitura(bigint, jsonb)",
    "lancar_placas(bigint, jsonb, boolean)",
    "criar_compostas(bigint, text, text, jsonb, boolean)",
    "teste_feito(bigint, text, bigint[], date, boolean)",
    "teste_acao(bigint, text, text, bigint[], text, numeric)",
    "concluir_drops(bigint, bigint[], text, int, text, boolean)",
    "abrir_desvio_drop(bigint, bigint)",
    "fechar_desvio_drop(bigint, bigint, int[])",
    "registrar_embarque(bigint, text, int, int, text, text, int[], date, boolean)",
    "criar_compostas_embarque(bigint, text, int, int, jsonb, boolean)",
    "registrar_recebimento_nfc(bigint, jsonb, boolean)",
    "lancar_contagem_nfc(bigint, jsonb, boolean)",
    "abrir_desvio_tanque(bigint, bigint, text)",
    "registrar_repeticao(bigint, bigint)",
    "finalizar_leitura_do_dia(bigint, boolean)",
]


@pytest.mark.parametrize("assinatura", FUNCOES_DO_APP)
def test_o_app_chama_a_funcao(conexao, assinatura):
    assert conexao.execute("SELECT has_function_privilege('labflow_app_web', %s, 'EXECUTE')", (assinatura,)).fetchone()[0]


@pytest.mark.parametrize("assinatura", FUNCOES_DO_APP)
def test_a_funcao_roda_como_dono(conexao, assinatura):
    """SECURITY DEFINER: o app não precisa de permissão nas tabelas por trás da função."""
    assert conexao.execute("SELECT prosecdef FROM pg_proc WHERE oid = %s::regprocedure", (assinatura,)).fetchone()[0]


@pytest.mark.parametrize("assinatura", ["coleta_registrar_pelo_bot(text, text, text, jsonb, text, text)", "bot_quem(text)"])
def test_as_do_bot_pelo_telefone_ficam_so_com_o_bot(conexao, assinatura):
    assert not conexao.execute("SELECT has_function_privilege('labflow_app_web', %s, 'EXECUTE')", (assinatura,)).fetchone()[0]
