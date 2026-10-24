-- Desfaz a 045: apaga as funções do embarque (amostras e compostas) e as portas de entrada do bot. Backup antes.
-- Publique antes o workflow que ainda grava o embarque pelo SQL próprio, e desfaça a migration do app que deu o GRANT ao
-- labflow_app_web, se houver.
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 045_embarque_funcoes_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS compostas_embarque_criar_pelo_bot(text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS embarque_registrar_pelo_bot(text, text, text, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS criar_compostas_embarque(bigint, text, int, int, jsonb, boolean);
DROP FUNCTION IF EXISTS registrar_embarque(bigint, text, int, int, text, text, int[], date, boolean);

COMMIT;
