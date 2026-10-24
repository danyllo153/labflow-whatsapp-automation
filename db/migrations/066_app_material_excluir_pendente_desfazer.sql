-- Desfaz a 066_app_material_excluir_pendente.sql. APAGA os dias excluídos e grava "<1" nos resultados pendentes
-- (para voltar a NOT NULL). Backup antes.

BEGIN;

DELETE FROM app.material_asseptico WHERE excluido_em IS NOT NULL;
DROP INDEX IF EXISTS app.material_asseptico_um_por_dia;
ALTER TABLE app.material_asseptico ADD CONSTRAINT material_asseptico_dia_key UNIQUE (dia);
ALTER TABLE app.material_asseptico DROP CONSTRAINT material_asseptico_exclusao_completa;
ALTER TABLE app.material_asseptico DROP COLUMN motivo_exclusao, DROP COLUMN excluido_em, DROP COLUMN excluido_por;
UPDATE app.material_asseptico SET ct = '<1' WHERE ct IS NULL;
UPDATE app.material_asseptico SET bl = '<1' WHERE bl IS NULL;
ALTER TABLE app.material_asseptico ALTER COLUMN ct SET DEFAULT '<1', ALTER COLUMN ct SET NOT NULL;
ALTER TABLE app.material_asseptico ALTER COLUMN bl SET DEFAULT '<1', ALTER COLUMN bl SET NOT NULL;

COMMIT;
