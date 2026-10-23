-- Desfaz a 054_app_esterilizacao.sql: apaga a tabela das esterilizações do app. Backup antes (apaga o que foi registrado).

BEGIN;

DROP TABLE IF EXISTS app.esterilizacoes;

COMMIT;
