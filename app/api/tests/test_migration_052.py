"""APP-021: migration 052_app_turno (07 v1.0, §2 Entrar no turno, §3 Início, §4 Relatório do turno, "Tabelas do app")."""

from datetime import datetime, timezone

import pytest
from psycopg import errors

AGORA = datetime(2026, 10, 22, 8, 5, tzinfo=timezone.utc)


def _um_usuario(con):
    return con.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1").fetchone()[0]


def _como_app(con):
    con.execute("SET LOCAL ROLE labflow_app_web")


def test_turnos_com_horario_padrao(conexao):
    turnos = conexao.execute("SELECT nome, inicio::text, fim::text FROM app.turnos ORDER BY ordem").fetchall()
    assert turnos == [("Manhã", "08:00:00", "16:00:00"), ("Tarde", "16:00:00", "00:00:00"), ("Madrugada", "00:00:00", "08:00:00")]


def test_lista_inicial_de_atividades_fixas(conexao):
    por_turno = dict(
        conexao.execute(
            "SELECT t.nome, count(*) FROM app.atividades_fixas a JOIN app.turnos t ON t.id = a.turno_id GROUP BY t.nome"
        ).fetchall()
    )
    assert por_turno == {"Manhã": 11, "Tarde": 8, "Madrugada": 7}
    sexta = conexao.execute(
        "SELECT dias_semana FROM app.atividades_fixas WHERE texto = 'Coliformes demais fábricas'"
    ).fetchone()[0]
    assert sexta == [5]


def test_app_web_registra_entrada_relatorio_e_atividade(conexao):
    uid = _um_usuario(conexao)
    _como_app(conexao)
    conexao.execute(
        "INSERT INTO app.entradas_turno (usuario_id, turno_id, dia, entrada) VALUES (%s, 1, '2026-10-22', %s)", (uid, AGORA)
    )
    conexao.execute("INSERT INTO app.relatorios_turno (turno_id, dia, ocorrencias) VALUES (1, '2026-10-22', 'Estufa 3 Não ok')")
    fixa = conexao.execute("SELECT id FROM app.atividades_fixas WHERE turno_id = 1 ORDER BY ordem LIMIT 1").fetchone()[0]
    conexao.execute(
        "INSERT INTO app.atividades_feitas (atividade_fixa_id, turno_id, dia, feito, marcado_por) VALUES (%s, 1, '2026-10-22', true, %s)",
        (fixa, uid),
    )
    conexao.execute(
        "INSERT INTO app.atividades_feitas (pendencia_texto, turno_id, dia, feito, marcado_por) VALUES ('Repor ágar', 1, '2026-10-22', false, %s)",
        (uid,),
    )
    assert conexao.execute("SELECT count(*) FROM app.atividades_feitas").fetchone()[0] == 2
    # horário padrão: o Admin muda pela API, mas não cria nem apaga turno
    conexao.execute("UPDATE app.turnos SET fim = '15:00' WHERE id = 1")
    conexao.execute("SAVEPOINT s")
    with pytest.raises(errors.InsufficientPrivilege):
        conexao.execute("DELETE FROM app.turnos WHERE id = 3")
    conexao.execute("ROLLBACK TO SAVEPOINT s")


@pytest.mark.parametrize(
    ("sql", "erro"),
    [
        # a mesma pessoa duas vezes no mesmo turno e dia
        ("INSERT INTO app.entradas_turno (usuario_id, turno_id, dia, entrada) VALUES ({u}, 1, '2026-10-22', now()), ({u}, 1, '2026-10-22', now())",
         errors.UniqueViolation),
        # dois turnos abertos ao mesmo tempo para a mesma pessoa
        ("INSERT INTO app.entradas_turno (usuario_id, turno_id, dia, entrada) VALUES ({u}, 1, '2026-10-22', now()), ({u}, 2, '2026-10-22', now())",
         errors.UniqueViolation),
        # saída antes da entrada
        ("INSERT INTO app.entradas_turno (usuario_id, turno_id, dia, entrada, saida) VALUES ({u}, 1, '2026-10-22', now(), now() - interval '1 hour')",
         errors.CheckViolation),
        # dia da semana fora de 1..7
        ("INSERT INTO app.atividades_fixas (turno_id, texto, dias_semana, ordem) VALUES (1, 'X', ARRAY[8]::smallint[], 99)",
         errors.CheckViolation),
        # atividade feita sem dizer qual (nem fixa nem escrita)
        ("INSERT INTO app.atividades_feitas (turno_id, dia, feito, marcado_por) VALUES (1, '2026-10-22', true, {u})",
         errors.CheckViolation),
        # reabrir sem motivo
        ("INSERT INTO app.relatorios_turno (turno_id, dia, reaberto_por, reaberto_em) VALUES (1, '2026-10-22', {u}, now())",
         errors.CheckViolation),
        # encerrado sem dizer por quem e sem ser automático
        ("INSERT INTO app.relatorios_turno (turno_id, dia, encerrado_em) VALUES (1, '2026-10-22', now())",
         errors.CheckViolation),
        # turno que não existe
        ("INSERT INTO app.relatorios_turno (turno_id, dia) VALUES (9, '2026-10-22')", errors.ForeignKeyViolation),
    ],
)
def test_o_banco_recusa_o_que_nao_faz_sentido(conexao, sql, erro):
    uid = _um_usuario(conexao)
    _como_app(conexao)
    with pytest.raises(erro):
        conexao.execute(sql.format(u=uid))


def test_uma_marcacao_por_atividade_no_turno(conexao):
    uid = _um_usuario(conexao)
    fixa = conexao.execute("SELECT id FROM app.atividades_fixas ORDER BY id LIMIT 1").fetchone()[0]
    sql = "INSERT INTO app.atividades_feitas (atividade_fixa_id, turno_id, dia, feito, marcado_por) VALUES (%s, 1, '2026-10-22', true, %s)"
    conexao.execute(sql, (fixa, uid))
    with pytest.raises(errors.UniqueViolation):
        conexao.execute(sql, (fixa, uid))


def test_app_web_nao_ganhou_nada_nas_tabelas_do_bot(conexao):
    _como_app(conexao)
    with pytest.raises(errors.InsufficientPrivilege):
        conexao.execute("UPDATE usuarios SET nome = nome")
