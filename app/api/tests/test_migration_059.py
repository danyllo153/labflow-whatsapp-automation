"""APP-041: migration 059_app_material_asseptico."""

import psycopg
import pytest


def _uid(conexao):
    return conexao.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1").fetchone()[0]


def test_um_registro_por_dia_e_ct_bl_comecam_pendentes(conexao):
    pagina = conexao.execute("INSERT INTO app.paginas_laudo (laudo) VALUES ('material-asseptico') RETURNING id").fetchone()[0]
    conexao.execute("INSERT INTO app.material_asseptico (dia, preenchido_por, pagina_id) VALUES ('2026-10-22', %s, %s)", (_uid(conexao), pagina))
    # a 066 tirou o "<1" padrão: sem resultado, o C.T. e o B.L. ficam pendentes (nulos)
    assert conexao.execute("SELECT ct, bl FROM app.material_asseptico").fetchone() == (None, None)
    with pytest.raises(psycopg.errors.UniqueViolation):
        conexao.execute("INSERT INTO app.material_asseptico (dia, preenchido_por, pagina_id) VALUES ('2026-10-22', %s, %s)", (_uid(conexao), pagina))


def test_tipo_agua_de_diluicao_na_esterilizacao(conexao):
    conexao.execute(
        "INSERT INTO app.esterilizacoes (tipo, ciclo, turno_id, dia, feita_por) VALUES ('Água de diluição', 'A1', 1, '2026-10-22', %s)",
        (_uid(conexao),),
    )
    with pytest.raises(psycopg.errors.CheckViolation):
        conexao.execute("INSERT INTO app.paginas_laudo (laudo) VALUES ('outro')")
