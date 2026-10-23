"""APP-022b: migration 053_app_turno_checkin (horário do clique guardado e correção com motivo)."""

import psycopg
import pytest


def test_colunas_do_checkin(conexao):
    colunas = {
        c for (c,) in conexao.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'entradas_turno'"
        )
    }
    assert {"entrada_registrada", "saida_registrada", "motivo_correcao", "corrigida_por"} <= colunas


def _nova_entrada(conexao, **extra):
    uid = conexao.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1").fetchone()[0]
    campos = {"usuario_id": uid, "turno_id": 1, "dia": "2026-10-22", "entrada": "2026-10-22 08:00-03", **extra}
    nomes = ", ".join(campos)
    return conexao.execute(
        f"INSERT INTO app.entradas_turno ({nomes}) VALUES ({', '.join(['%s'] * len(campos))}) RETURNING entrada_registrada",
        list(campos.values()),
    ).fetchone()[0]


def test_hora_registrada_vem_sozinha(conexao):
    assert _nova_entrada(conexao) is not None


def test_correcao_sem_motivo_e_recusada(conexao):
    uid = conexao.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1").fetchone()[0]
    with pytest.raises(psycopg.errors.CheckViolation):
        _nova_entrada(conexao, corrigida_por=uid)
