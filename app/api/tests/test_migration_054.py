"""APP-026: migration 054_app_esterilizacao."""

import psycopg
import pytest


def _inserir(conexao, **campos):
    uid = conexao.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1").fetchone()[0]
    base = {"tipo": "Ponteira", "ciclo": "102", "turno_id": 1, "dia": "2026-10-22", "feita_por": uid}
    base.update(campos)
    return conexao.execute(
        f"INSERT INTO app.esterilizacoes ({', '.join(base)}) VALUES ({', '.join(['%s'] * len(base))}) RETURNING id",
        list(base.values()),
    ).fetchone()[0]


def test_registro_valido_e_hora_automatica(conexao):
    assert _inserir(conexao) > 0
    assert conexao.execute("SELECT feita_em IS NOT NULL FROM app.esterilizacoes").fetchone()[0]


@pytest.mark.parametrize(
    "campos",
    [
        {"tipo": "Autoclave"},  # tipo fora da lista
        {"ciclo": "  "},  # ciclo obrigatório
        {"tipo": "Outro"},  # Outro pede a descrição
    ],
)
def test_registro_invalido_e_recusado(conexao, campos):
    with pytest.raises(psycopg.errors.CheckViolation):
        _inserir(conexao, **campos)


def test_excluir_e_corrigir_pedem_motivo(conexao):
    uid = conexao.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1").fetchone()[0]
    for campos in (
        {"excluida_por": uid, "excluida_em": "2026-10-22 10:00-03"},
        {"corrigida_por": uid, "corrigida_em": "2026-10-22 10:00-03"},
    ):
        with pytest.raises(psycopg.errors.CheckViolation), conexao.transaction():  # ponto de volta: a transação do teste segue
            _inserir(conexao, **campos)
