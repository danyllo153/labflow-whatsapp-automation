-- Desfaz a 053_app_turno_checkin.sql: tira as colunas do check-in (horário registrado e motivo da correção).
-- Os horários corrigidos continuam em entrada/saida; perde-se o horário original e o motivo. Backup antes.

BEGIN;

ALTER TABLE app.entradas_turno
    DROP CONSTRAINT IF EXISTS entradas_turno_correcao_com_motivo,
    DROP COLUMN IF EXISTS corrigida_por,
    DROP COLUMN IF EXISTS motivo_correcao,
    DROP COLUMN IF EXISTS saida_registrada,
    DROP COLUMN IF EXISTS entrada_registrada;

COMMIT;
