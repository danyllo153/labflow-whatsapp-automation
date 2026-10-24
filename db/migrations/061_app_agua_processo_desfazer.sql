-- Desfaz a 061_app_agua_processo.sql: apaga as coletas de água do processo e as páginas do laudo. Backup antes.

BEGIN;

DROP TABLE IF EXISTS app.coletas_agua_processo;
DELETE FROM app.paginas_laudo WHERE laudo = 'agua-processo';

COMMIT;
