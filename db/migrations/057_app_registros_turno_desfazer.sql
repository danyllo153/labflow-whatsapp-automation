-- Desfaz a 057_app_registros_turno.sql: apaga a tabela dos registros livres do turno. Backup antes (apaga o que foi escrito).

BEGIN;

DROP TABLE IF EXISTS app.registros_turno;

COMMIT;
