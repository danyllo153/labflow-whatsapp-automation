-- Teste da migration 089 (app.entradas_turno.colocado_por). Roda DEPOIS de aplicar a 089, com o usuario dono.
-- Tudo em BEGIN ... ROLLBACK, dados ficticios.
BEGIN;
DO $$
DECLARE v_a bigint; v_b bigint; v_turno bigint; v_ok boolean;
BEGIN
    INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000071', 'Pessoa Teste A', 'Analista') RETURNING id INTO v_a;
    INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000072', 'Pessoa Teste B', 'Analista') RETURNING id INTO v_b;
    SELECT id INTO v_turno FROM app.turnos ORDER BY id LIMIT 1;
    -- entrada propria: colocado_por fica NULL (e e o que registros antigos tem)
    INSERT INTO app.entradas_turno (usuario_id, turno_id, dia, entrada) VALUES (v_a, v_turno, current_date, now());
    IF (SELECT colocado_por FROM app.entradas_turno WHERE usuario_id = v_a) IS NOT NULL THEN RAISE EXCEPTION 'entrada propria com colocado_por'; END IF;
    -- entrada colocada por A
    INSERT INTO app.entradas_turno (usuario_id, turno_id, dia, entrada, colocado_por) VALUES (v_b, v_turno, current_date, now(), v_a);
    IF (SELECT colocado_por FROM app.entradas_turno WHERE usuario_id = v_b) <> v_a THEN RAISE EXCEPTION 'colocado_por nao gravou'; END IF;
    -- chave estrangeira: id que nao existe e recusado
    BEGIN
        UPDATE app.entradas_turno SET colocado_por = -999 WHERE usuario_id = v_b;
        RAISE EXCEPTION 'aceitou colocado_por inexistente';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    -- permissoes da API: le e grava a coluna, sem TRUNCATE
    SELECT has_column_privilege('labflow_app_web', 'app.entradas_turno', 'colocado_por', 'SELECT,INSERT,UPDATE') INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'labflow_app_web sem acesso a colocado_por'; END IF;
    IF has_table_privilege('labflow_app_web', 'app.entradas_turno', 'TRUNCATE') THEN RAISE EXCEPTION 'labflow_app_web com TRUNCATE'; END IF;
END $$;
ROLLBACK;
SELECT 'OK 089' AS resultado;
