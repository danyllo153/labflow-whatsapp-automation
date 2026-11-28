-- Teste das migrations 086 (nomes no laudo) e 087 (nome de pessoa, máx. 40). Roda DEPOIS de aplicar as duas.
-- Tudo dentro de BEGIN ... ROLLBACK: não deixa resíduo. Usar o usuário dono: psql -v ON_ERROR_STOP=1 -U lfadmin -d <banco> -f tests/db/086_087_nomes.sql
-- Dados fictícios.
BEGIN;

DO $$
DECLARE
    v_a bigint; v_b bigint; v_n int; v_ok boolean;
BEGIN
    INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000001', 'Pessoa Teste A', 'Analista') RETURNING id INTO v_a;
    INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000002', 'Pessoa Teste B', 'Coletor') RETURNING id INTO v_b;

    -- 087: 40 passa, 41 não; < > ; e controle não; apóstrofo e ponto passam; NULL passa
    INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000003', repeat('x', 40), 'Analista');
    INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000004', 'D''Avila Jr.', 'Analista');
    INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000005', NULL, 'Analista');
    FOR v_n IN 1..4 LOOP
        BEGIN
            INSERT INTO usuarios (telefone, nome, cargo)
            VALUES ('55000000001' || v_n, CASE v_n WHEN 1 THEN repeat('x', 41) WHEN 2 THEN 'a<b' WHEN 3 THEN 'a;b' ELSE E'a\nb' END, 'Analista');
            RAISE EXCEPTION 'nome ruim passou (caso %)', v_n;
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END LOOP;
    -- UPDATE de outra coluna em nome antigo (se houver) não é bloqueado pela trava (NOT VALID ou validada, ambos ok)
    UPDATE usuarios SET cargo = 'Analista' WHERE id = v_a;

    -- 087: a função recusa nome com 41 letras, com mensagem clara
    BEGIN
        PERFORM cadastrar_usuario(repeat('y', 41), '5500000000006', 'Analista', (SELECT id FROM usuarios WHERE cargo = 'Admin' ORDER BY id LIMIT 1));
        RAISE EXCEPTION 'cadastrar_usuario aceitou 41 letras';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE 'Nome muito longo (máximo 40%' THEN RAISE; END IF;
    END;

    -- 086: grava, lê, não duplica (laudo, pagina, dia), limita 1..6 pessoas
    INSERT INTO app.nomes_no_laudo (laudo, pagina_id, dia, pessoas, escolhido_por) VALUES ('recebimento', 1, NULL, ARRAY[v_a, v_b], v_a);
    INSERT INTO app.nomes_no_laudo (laudo, pagina_id, dia, pessoas, escolhido_por) VALUES ('recebimento', 1, current_date, ARRAY[v_a], v_a);
    BEGIN
        INSERT INTO app.nomes_no_laudo (laudo, pagina_id, dia, pessoas, escolhido_por) VALUES ('recebimento', 1, NULL, ARRAY[v_b], v_a);
        RAISE EXCEPTION 'duplicou a folha inteira (dia NULL)';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO app.nomes_no_laudo (laudo, pagina_id, dia, pessoas, escolhido_por) VALUES ('x', 2, NULL, '{}', v_a);
        RAISE EXCEPTION 'aceitou lista vazia';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO app.nomes_no_laudo (laudo, pagina_id, dia, pessoas, escolhido_por) VALUES ('x', 3, NULL, ARRAY[1,2,3,4,5,6,7], v_a);
        RAISE EXCEPTION 'aceitou 7 pessoas';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO app.nomes_no_laudo (laudo, pagina_id, dia, pessoas, escolhido_por) VALUES ('x', 4, NULL, ARRAY[v_a], -999);
        RAISE EXCEPTION 'aceitou escolhido_por inexistente';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    -- permissões do app: o papel da API lê/grava a tabela nova e NÃO vira dono nem superusuário
    SELECT has_table_privilege('labflow_app_web', 'app.nomes_no_laudo', 'SELECT,INSERT,UPDATE,DELETE') INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'labflow_app_web sem acesso a app.nomes_no_laudo'; END IF;
    IF has_table_privilege('labflow_app_web', 'app.nomes_no_laudo', 'TRUNCATE') THEN RAISE EXCEPTION 'labflow_app_web com TRUNCATE'; END IF;
    IF (SELECT rolsuper FROM pg_roles WHERE rolname = 'labflow_app_web') THEN RAISE EXCEPTION 'labflow_app_web é superusuário'; END IF;
    IF (SELECT tableowner FROM pg_tables WHERE schemaname = 'app' AND tablename = 'nomes_no_laudo') = 'labflow_app_web' THEN
        RAISE EXCEPTION 'labflow_app_web é dona da tabela';
    END IF;
    -- a API não ganhou DELETE em usuarios: a lista de pessoas nunca é esvaziada por ela
    IF has_table_privilege('labflow_app_web', 'public.usuarios', 'DELETE') THEN RAISE EXCEPTION 'labflow_app_web pode apagar usuarios'; END IF;
END $$;

ROLLBACK;
SELECT 'OK 086/087' AS resultado;
