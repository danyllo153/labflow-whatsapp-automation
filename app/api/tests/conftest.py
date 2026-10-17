import os

import pytest

from labflow_api import banco


@pytest.fixture
def conexao():
    """Conexão com o banco de TESTE (montado por scripts/preparar_banco_teste.sh).

    Sem LABFLOW_DB_URL, o teste é pulado no computador local; no GitHub Actions
    (LABFLOW_EXIGIR_BANCO=1) a falta do banco é erro, para nunca passar sem testar.
    """
    if not os.environ.get("LABFLOW_DB_URL"):
        if os.environ.get("LABFLOW_EXIGIR_BANCO") == "1":
            pytest.fail("LABFLOW_DB_URL não definida, mas o banco de teste é obrigatório aqui.")
        pytest.skip("Sem banco de teste (defina LABFLOW_DB_URL).")
    with banco.conectar() as con:
        yield con
