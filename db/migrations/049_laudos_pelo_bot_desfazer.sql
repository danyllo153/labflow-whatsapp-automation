-- Desfaz a 049: apaga a função que registra esterilização, água, baias e linhas por frase. Backup antes.
-- Publique antes o workflow que ainda não chama esta função.
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 049_laudos_pelo_bot_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS laudo_registrar_pelo_bot(text, jsonb, text);

COMMIT;
