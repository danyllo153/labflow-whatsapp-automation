-- Desfaz a 040: apaga as funções de registrar recebimento e lançar C.T/B.L (o que já foi gravado fica). Backup antes.
-- Antes, tire do app (e do bot, se já usar) as chamadas a elas, e desfaça a migration do app que deu o GRANT ao labflow_app_web.
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 040_recebimento_registrar_lancar_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS lancar_contagem(bigint, text, jsonb, boolean);
DROP FUNCTION IF EXISTS registrar_recebimento(bigint, text, text, text, int[], date, boolean, boolean);
DROP FUNCTION IF EXISTS lista_compacta(int[]);

COMMIT;
