-- Desfaz a 063_app_fluxo_laminar.sql: apaga o branco do dia e as páginas do laudo. Backup antes.

BEGIN;

DROP TABLE IF EXISTS app.fluxo_laminar;
DELETE FROM app.paginas_laudo WHERE laudo = 'fluxo-laminar';

COMMIT;
