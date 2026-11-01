-- 082 — app: apagar uma folha de laudo DE VEZ (pedido do Danyllo, 01/11: "todo laudo deve dar para deletar permanente,
-- para não poluir o banco")
--
-- Faixa do app (050–099). Desfazer: 082_app_apagar_folha_desfazer.sql. Aplicar com o administrador do banco, depois de
-- um backup.
--
-- O Admin apaga a folha: a linha de app.paginas_laudo (ou de app.laudos_esterilizacao) sai do banco. O que estava nela
-- NÃO se apaga: o registro (a coleta de água, o dia do branco, o lugar do dia da incubação...) fica com pagina_id NULL,
-- que quer dizer "fora do laudo" e impede que a linha volte sozinha para uma folha nova. As análises continuam nas
-- páginas de análise. O Refazer folha (077) também passa a apagar a folha antiga em vez de guardá-la excluída.
--
-- Todas as colunas que apontam para app.paginas_laudo passam a aceitar NULL (lidas do catálogo, como no app).

BEGIN;

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
        EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I DROP NOT NULL', r.esquema, r.tabela, r.coluna);
        EXECUTE format('GRANT UPDATE (%I) ON %I.%I TO labflow_app_web', r.coluna, r.esquema, r.tabela);
    END LOOP;
END $$;

GRANT DELETE ON app.paginas_laudo, app.laudos_esterilizacao TO labflow_app_web;

COMMIT;
