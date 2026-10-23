-- Desfaz a 037: apaga a porta de entrada do bot (as funções da 036 e o histórico ficam). Backup antes.
-- Publique antes o workflow sem os comandos de corrigir recebimento (senão o bot chama uma função que não existe).
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 037_recebimento_bot_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS recebimento_pelo_bot(text, jsonb, text);

COMMIT;
