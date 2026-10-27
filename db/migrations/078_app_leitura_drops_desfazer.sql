-- Desfaz a 078_app_leitura_drops.sql: apaga as leituras de drop gravadas pelo app. Backup antes.

BEGIN;

DROP TABLE IF EXISTS app.leituras_drop;

COMMIT;
