-- Desfaz a 047: apaga as funções de desvio de tanque, repetição e leitura do dia e as portas de entrada do bot. Backup antes.
-- Publique antes o workflow que ainda grava esses pelo SQL próprio, e desfaça a migration do app que deu o GRANT ao
-- labflow_app_web, se houver.
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 047_desvio_tanque_dia_funcoes_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS leitura_dia_finalizar_pelo_bot(text);
DROP FUNCTION IF EXISTS desvio_tanque_pelo_bot(text, jsonb);
DROP FUNCTION IF EXISTS finalizar_leitura_do_dia(bigint, boolean);
DROP FUNCTION IF EXISTS registrar_repeticao(bigint, bigint);
DROP FUNCTION IF EXISTS abrir_desvio_tanque(bigint, bigint, text);

COMMIT;
