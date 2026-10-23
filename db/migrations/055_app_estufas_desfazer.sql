-- Desfaz a 055_app_estufas.sql: apaga as tabelas das estufas do app (estufas, faixas e leituras). Backup antes.

BEGIN;

DROP TABLE IF EXISTS app.leituras_estufa, app.faixas_estufa, app.estufas;

COMMIT;
