-- Desfaz a 044: apaga as funções de drops e desvio de drop e as portas de entrada do bot. Backup antes.
-- Publique antes o workflow que ainda grava drops e desvios pelo SQL próprio, e desfaça a migration do app que deu o GRANT ao
-- labflow_app_web, se houver.
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 044_drops_funcoes_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS desvio_drop_pelo_bot(text, jsonb);
DROP FUNCTION IF EXISTS drops_concluir_pelo_bot(text, text, text, text);
DROP FUNCTION IF EXISTS fechar_desvio_drop(bigint, bigint, int[]);
DROP FUNCTION IF EXISTS abrir_desvio_drop(bigint, bigint);
DROP FUNCTION IF EXISTS concluir_drops(bigint, bigint[], text, int, text, boolean);

COMMIT;
