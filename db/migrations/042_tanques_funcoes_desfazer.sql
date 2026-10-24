-- Desfaz a 042: apaga as funções de tanques (coleta, análise, leitura, placas) e as portas de entrada do bot. Backup antes.
-- Publique antes o workflow que ainda grava os tanques pelo SQL próprio (backup anterior ao da 042), e desfaça a migration do
-- app que deu o GRANT ao labflow_app_web, se houver.
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 042_tanques_funcoes_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS placas_lancar_pelo_bot(text, jsonb);
DROP FUNCTION IF EXISTS leitura_concluir_pelo_bot(text, jsonb);
DROP FUNCTION IF EXISTS analise_registrar_pelo_bot(text, text, jsonb, text, text);
DROP FUNCTION IF EXISTS coleta_registrar_pelo_bot(text, text, text, jsonb, text, text);
DROP FUNCTION IF EXISTS bot_quem(text);
DROP FUNCTION IF EXISTS lancar_placas(bigint, jsonb, boolean);
DROP FUNCTION IF EXISTS concluir_leitura(bigint, jsonb);
DROP FUNCTION IF EXISTS registrar_analise(bigint, text, text[], text, date, boolean);
DROP FUNCTION IF EXISTS registrar_coleta(bigint, text, text, text[], date, text, boolean);
DROP FUNCTION IF EXISTS tanque_exigir_cargo(bigint, text[]);

COMMIT;
