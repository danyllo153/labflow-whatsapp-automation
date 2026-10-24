"""APP-036 a APP-045: migrations 060 (meios e lotes), 061 (água), 062 (superfícies), 063 (fluxo laminar), 064 (recebimento)."""

import psycopg
import pytest


def _uid(conexao):
    return conexao.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1").fetchone()[0]


def _pagina(conexao, laudo):
    return conexao.execute("INSERT INTO app.paginas_laudo (laudo) VALUES (%s) RETURNING id", (laudo,)).fetchone()[0]


def test_um_lote_em_uso_por_meio(conexao):
    p = _pagina(conexao, "meios-OSA")
    a, b = (
        conexao.execute(
            "INSERT INTO app.lotes_meio (meio, lote, recebido_em, cadastrado_por, pagina_id) VALUES ('OSA', %s, '2026-01-01', %s, %s) RETURNING id",
            (lote, _uid(conexao), p),
        ).fetchone()[0]
        for lote in ("1", "2")
    )
    conexao.execute("INSERT INTO app.uso_lote_meio (meio, lote_meio_id, marcado_por) VALUES ('OSA', %s, %s)", (a, _uid(conexao)))
    with pytest.raises(psycopg.errors.UniqueViolation):
        conexao.execute("INSERT INTO app.uso_lote_meio (meio, lote_meio_id, marcado_por) VALUES ('OSA', %s, %s)", (b, _uid(conexao)))


def test_agua_precisa_de_um_ponto_e_paginas_so_dos_laudos_conhecidos(conexao):
    p = _pagina(conexao, "agua-processo")
    with pytest.raises(psycopg.errors.CheckViolation), conexao.transaction():
        conexao.execute(
            "INSERT INTO app.coletas_agua_processo (coletada_em, coletada_por, pagina_id) VALUES (now(), %s, %s)", (_uid(conexao), p)
        )
    with pytest.raises(psycopg.errors.CheckViolation):
        _pagina(conexao, "outro-laudo")


def test_superficie_e_fluxo_laminar(conexao):
    p = _pagina(conexao, "superficies-Baia")
    with pytest.raises(psycopg.errors.CheckViolation), conexao.transaction():
        conexao.execute(
            "INSERT INTO app.coletas_superficie (tipo, ponto, coletada_em, analisada_em, coletada_por, pagina_id) VALUES ('Mangote', '1', now(), current_date, %s, %s)",
            (_uid(conexao), p),
        )
    f = _pagina(conexao, "fluxo-laminar")
    conexao.execute("INSERT INTO app.fluxo_laminar (dia, preenchido_por, pagina_id) VALUES ('2026-10-22', %s, %s)", (_uid(conexao), f))
    assert conexao.execute("SELECT osa, wort, pca FROM app.fluxo_laminar").fetchone() == ("<1", "-", "-")


def test_o_app_nao_apaga_nas_tabelas_novas(conexao):
    conexao.execute("SET LOCAL ROLE labflow_app_web")
    for tabela in ("lotes_meio", "uso_lote_meio", "coletas_agua_processo", "coletas_superficie", "fluxo_laminar"):
        conexao.execute("SAVEPOINT s")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conexao.execute(f"DELETE FROM app.{tabela}")
        conexao.execute("ROLLBACK TO SAVEPOINT s")
