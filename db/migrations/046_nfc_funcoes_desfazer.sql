-- Desfaz a 046: apaga as funções do recebimento de NFC e as portas de entrada do bot. Backup antes.
-- Publique antes o workflow que ainda grava o NFC recebido pelo SQL próprio, e desfaça a migration do app que deu o GRANT ao
-- labflow_app_web, se houver.
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 046_nfc_funcoes_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS contagem_nfc_lancar_pelo_bot(text, jsonb);
DROP FUNCTION IF EXISTS recebimento_nfc_registrar_pelo_bot(text, jsonb);
DROP FUNCTION IF EXISTS lancar_contagem_nfc(bigint, jsonb, boolean);
DROP FUNCTION IF EXISTS registrar_recebimento_nfc(bigint, jsonb, boolean);

COMMIT;
