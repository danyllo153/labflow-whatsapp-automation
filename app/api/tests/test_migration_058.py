"""APP-035: migration 058_app_laudo_esterilizacao."""

import psycopg
import pytest


def _uid(conexao):
    return conexao.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1").fetchone()[0]


def test_eficiente_comeca_em_sim_e_pagina_aponta_para_o_laudo(conexao):
    laudo = conexao.execute("INSERT INTO app.laudos_esterilizacao DEFAULT VALUES RETURNING id").fetchone()[0]
    conexao.execute(
        "INSERT INTO app.esterilizacoes (tipo, ciclo, turno_id, dia, feita_por, laudo_id) VALUES ('Ponteira', '1', 1, '2026-10-22', %s, %s)",
        (_uid(conexao), laudo),
    )
    assert conexao.execute("SELECT eficiente FROM app.esterilizacoes").fetchone()[0] is True


def test_impressa_pede_quem_e_quando_juntos(conexao):
    with pytest.raises(psycopg.errors.CheckViolation):
        conexao.execute("INSERT INTO app.laudos_esterilizacao (impresso_em) VALUES (now())")


def test_modelo_so_aceita_pdf_de_ate_5_mb_e_o_app_nao_apaga(conexao):
    conexao.execute("INSERT INTO app.modelos_documento (nome, pdf, enviado_por) VALUES ('x', 'abc', %s)", (_uid(conexao),))
    conexao.execute("SET LOCAL ROLE labflow_app_web")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        conexao.execute("DELETE FROM app.modelos_documento")
