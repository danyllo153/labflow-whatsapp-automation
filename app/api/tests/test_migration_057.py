"""APP-033: migration 057_app_registros_turno."""

import psycopg
import pytest


def _inserir(conexao, **campos):
    uid = conexao.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1").fetchone()[0]
    base = {"turno_id": 1, "dia": "2026-10-22", "texto": "Troca de ponteiras", "feita_por": uid}
    base.update(campos)
    return conexao.execute(
        f"INSERT INTO app.registros_turno ({', '.join(base)}) VALUES ({', '.join(['%s'] * len(base))}) RETURNING id",
        list(base.values()),
    ).fetchone()[0]


def test_registro_valido_e_hora_automatica(conexao):
    assert _inserir(conexao) > 0
    assert conexao.execute("SELECT feita_em IS NOT NULL FROM app.registros_turno").fetchone()[0]


@pytest.mark.parametrize("campos", [{"texto": "   "}, {"texto": "x" * 201}])
def test_texto_vazio_ou_longo_e_recusado(conexao, campos):
    with pytest.raises(psycopg.errors.CheckViolation):
        _inserir(conexao, **campos)


def test_o_app_nao_apaga_de_verdade(conexao):
    _inserir(conexao)
    conexao.execute("SET LOCAL ROLE labflow_app_web")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        conexao.execute("DELETE FROM app.registros_turno")
