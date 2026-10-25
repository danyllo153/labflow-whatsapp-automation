-- Desfaz a 048: apaga as funções da foto de TAB/Coliformes e do TAB de tanque e as portas de entrada do bot. Backup antes.
-- Publique antes o workflow que ainda tem o SQL próprio nesses nós, e desfaça a migration do app que deu o GRANT ao
-- labflow_app_web, se houver.
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 048_foto_tab_nfc_funcoes_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS tab_feito_nfc_pelo_bot(text, jsonb, text, text, text);
DROP FUNCTION IF EXISTS coliformes_foto_pelo_bot(text, jsonb);
DROP FUNCTION IF EXISTS tab_foto_pelo_bot(text, jsonb);
DROP FUNCTION IF EXISTS tab_feito_nfc(bigint, jsonb, date, date, boolean);
DROP FUNCTION IF EXISTS coliformes_registrar_foto(bigint, jsonb);
DROP FUNCTION IF EXISTS tab_registrar_foto(bigint, jsonb);

COMMIT;
