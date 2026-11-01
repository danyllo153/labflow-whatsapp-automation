-- Desfaz a 082: o app deixa de apagar folhas de laudo e as colunas que apontam para a folha voltam a ser obrigatórias.
-- As folhas já apagadas não voltam. Se algum registro ficou "fora do laudo" (pagina_id NULL), esta desfazer RECUSA:
-- liste-os com  SELECT ... WHERE pagina_id IS NULL  em cada tabela e decida com o Danyllo antes.

BEGIN;

REVOKE DELETE ON app.paginas_laudo, app.laudos_esterilizacao FROM labflow_app_web;

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT n.nspname AS esquema, t.relname AS tabela, a.attname AS coluna
        FROM pg_constraint k
        JOIN pg_class t ON t.oid = k.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
        WHERE k.contype = 'f' AND k.confrelid = 'app.paginas_laudo'::regclass
    LOOP
        EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET NOT NULL', r.esquema, r.tabela, r.coluna);
    END LOOP;
END $$;

COMMIT;
