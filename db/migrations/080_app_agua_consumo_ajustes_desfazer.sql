-- Desfaz a 080: a coleta mensal deixa de valer como a semanal (o pH e o cloro lançados no mensal ficam nas linhas, mas
-- saem da tela e dos laudos semanais) e quem analisou volta a ser só o analisada_por de cada coleta.

BEGIN;

ALTER TABLE app.coletas_agua_consumo
    DROP COLUMN IF EXISTS fq_analisada_em, DROP COLUMN IF EXISTS fq_analisada_por,
    DROP COLUMN IF EXISTS micro_analisada_em, DROP COLUMN IF EXISTS micro_analisada_por;
ALTER TABLE app.resultados_agua_consumo DROP COLUMN IF EXISTS semanal;
ALTER TABLE app.pontos_agua_consumo DROP CONSTRAINT IF EXISTS pontos_agua_consumo_semanal_so_no_mensal;
ALTER TABLE app.pontos_agua_consumo DROP COLUMN IF EXISTS semanal;

COMMIT;
