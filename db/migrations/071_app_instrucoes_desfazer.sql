-- Desfaz a 071_app_instrucoes.sql: apaga as instruções e os links dos vídeos escritos no app. Backup antes.

BEGIN;

DROP TABLE IF EXISTS app.instrucoes;

COMMIT;
