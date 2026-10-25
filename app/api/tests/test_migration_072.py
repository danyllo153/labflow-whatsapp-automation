"""072: o app chama as funções da 048 do bot (só as que recebem a pessoa) e o Coletor não registra baias e linhas."""

from datetime import datetime

import psycopg
import pytest

FUNCOES_DA_048 = [
    "tab_registrar_foto(bigint, jsonb)",
    "coliformes_registrar_foto(bigint, jsonb)",
    "tab_feito_nfc(bigint, jsonb, date, date, boolean)",
]


@pytest.mark.parametrize("assinatura", FUNCOES_DA_048)
def test_o_app_chama_a_funcao_da_048(conexao, assinatura):
    assert conexao.execute("SELECT has_function_privilege('labflow_app_web', %s, 'EXECUTE')", (assinatura,)).fetchone()[0]
    assert conexao.execute("SELECT prosecdef FROM pg_proc WHERE oid = %s::regprocedure", (assinatura,)).fetchone()[0]


@pytest.mark.parametrize(
    "assinatura",
    ["tab_foto_pelo_bot(text, jsonb)", "coliformes_foto_pelo_bot(text, jsonb)", "tab_feito_nfc_pelo_bot(text, jsonb, text, text, text)"],
)
def test_as_da_048_pelo_telefone_ficam_so_com_o_bot(conexao, assinatura):
    assert not conexao.execute("SELECT has_function_privilege('labflow_app_web', %s, 'EXECUTE')", (assinatura,)).fetchone()[0]


def test_coletor_nao_registra_baia_nem_linha(conexao, criar_pessoa):
    coletor = criar_pessoa(usuario="coletor.baia", cargo="Coletor")
    with pytest.raises(psycopg.errors.RaiseException, match="não pode"):
        with conexao.transaction():  # o erro desfaz só este pedaço
            conexao.execute(
                "SELECT * FROM app.bot_coletar_superficie(%s, 'Baia', ARRAY['8'], %s)", (coletor, datetime.now().astimezone())
            )
