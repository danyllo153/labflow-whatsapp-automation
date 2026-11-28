-- Desfaz a 086: apaga as escolhas de quem vai no laudo (os laudos voltam a sair com o NOME em branco). Backup antes.

BEGIN;

DROP TABLE IF EXISTS app.nomes_no_laudo;

COMMIT;
