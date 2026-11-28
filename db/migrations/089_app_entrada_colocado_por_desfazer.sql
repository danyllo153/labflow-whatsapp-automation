-- Desfaz a 089: tira a coluna colocado_por (perde so o registro de quem colocou cada pessoa no turno). Backup antes.

BEGIN;

ALTER TABLE app.entradas_turno DROP COLUMN IF EXISTS colocado_por;

COMMIT;
