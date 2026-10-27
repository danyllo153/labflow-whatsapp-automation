-- Desfaz a 080: a coleta mensal deixa de valer como a semanal. O pH e o cloro lançados no mensal ficam nas linhas,
-- mas saem da tela e dos laudos semanais.

BEGIN;

ALTER TABLE app.resultados_agua_consumo DROP COLUMN IF EXISTS semanal;
ALTER TABLE app.pontos_agua_consumo DROP CONSTRAINT IF EXISTS pontos_agua_consumo_semanal_so_no_mensal;
ALTER TABLE app.pontos_agua_consumo DROP COLUMN IF EXISTS semanal;

COMMIT;
