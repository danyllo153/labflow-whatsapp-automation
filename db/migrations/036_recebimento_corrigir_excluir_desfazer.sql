-- Desfaz a 036: apaga as funções de corrigir, excluir e recuperar recebimento. Os registros que elas já gravaram no
-- histórico (historico_alteracoes) e no arquivo (registros_excluidos) FICAM (são o histórico do laboratório). Backup antes.
-- Se o app já tiver o GRANT dessas funções (migration do app), desfaça a do app primeiro.
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 036_recebimento_corrigir_excluir_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS recuperar_recebimento(bigint, text, bigint);
DROP FUNCTION IF EXISTS excluir_recebimento(bigint, bigint, text);
DROP FUNCTION IF EXISTS corrigir_load(bigint, jsonb, bigint, text);
DROP FUNCTION IF EXISTS corrigir_recebimento(bigint, jsonb, bigint, text);
DROP FUNCTION IF EXISTS recebimento_exigir_permissao(bigint);

COMMIT;
