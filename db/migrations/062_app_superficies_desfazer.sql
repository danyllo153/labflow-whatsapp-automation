-- Desfaz a 062_app_superficies.sql: apaga as coletas de baias e linhas e as páginas do laudo. Backup antes.

BEGIN;

DROP TABLE IF EXISTS app.coletas_superficie;
DELETE FROM app.paginas_laudo WHERE laudo IN ('superficies-Baia', 'superficies-Linha');

COMMIT;
