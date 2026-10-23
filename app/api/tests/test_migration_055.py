"""APP-027: migration 055_app_estufas."""

import psycopg
import pytest


def test_as_onze_estufas_sem_a_05_e_a_06_e_auxiliar(conexao):
    linhas = conexao.execute("SELECT id, auxiliar FROM app.estufas ORDER BY id").fetchall()
    assert [i for i, _ in linhas] == [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]
    assert [i for i, aux in linhas if aux] == [6]


def _leitura(conexao, **campos):
    uid = conexao.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1").fetchone()[0]
    base = {"estufa_id": 1, "leitura": "Supervisório", "ok": True, "turno_id": 1, "dia": "2026-10-22", "feita_por": uid}
    base.update(campos)
    return conexao.execute(
        f"INSERT INTO app.leituras_estufa ({', '.join(base)}) VALUES ({', '.join(['%s'] * len(base))}) RETURNING id",
        list(base.values()),
    ).fetchone()[0]


def test_ok_sem_numero_e_nao_ok_com_temperatura(conexao):
    assert _leitura(conexao) > 0
    assert _leitura(conexao, leitura="Field chart", ok=False, temperatura=43.8) > 0


@pytest.mark.parametrize(
    "campos",
    [
        {"ok": False},  # Não ok sem temperatura
        {"ok": True, "temperatura": 36.0},  # Ok guarda número
        {"leitura": "Painel"},  # leitura fora da lista
    ],
)
def test_leitura_invalida_e_recusada(conexao, campos):
    with pytest.raises(psycopg.errors.CheckViolation):
        _leitura(conexao, **campos)


def test_uma_conferencia_por_estufa_leitura_turno_e_dia(conexao):
    _leitura(conexao)
    with pytest.raises(psycopg.errors.UniqueViolation):
        _leitura(conexao)


def test_faixa_com_maximo_maior_que_o_minimo(conexao):
    with pytest.raises(psycopg.errors.CheckViolation):
        conexao.execute("INSERT INTO app.faixas_estufa (estufa_id, minimo, maximo) VALUES (1, 37.0, 35.0)")
