-- Desfaz a 077_app_laudos_finalizar_excluir.sql. Backup antes. As folhas excluídas voltam a aparecer (vazias).

BEGIN;

REVOKE UPDATE (pagina_id) ON app.laudo_linhas, app.recebimento_laudo, app.recebimento_nfc_laudo, app.incubacao_dias
    FROM labflow_app_web;
ALTER TABLE app.laudos_esterilizacao DROP COLUMN excluida_por, DROP COLUMN excluida_em;
ALTER TABLE app.paginas_laudo DROP COLUMN excluida_por, DROP COLUMN excluida_em;

COMMIT;
