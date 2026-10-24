-- Desfaz a 041: apaga as portas de entrada do bot (as funções da 040 ficam). Backup antes.
-- Publique antes o workflow que ainda grava o recebimento e o C.T/B.L pelo SQL próprio (backup pre79 ou anterior).
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 041_recebimento_contagem_bot_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS contagem_lancar_pelo_bot(text, jsonb);
DROP FUNCTION IF EXISTS recebimento_registrar_pelo_bot(text, text, text, text, jsonb, text, text);

COMMIT;
