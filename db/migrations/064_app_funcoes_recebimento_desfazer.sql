-- Desfaz a 064_app_funcoes_recebimento.sql: tira do app o direito de chamar as funções de recebimento.

BEGIN;

REVOKE EXECUTE ON FUNCTION
    corrigir_recebimento(bigint, jsonb, bigint, text),
    corrigir_load(bigint, jsonb, bigint, text),
    excluir_recebimento(bigint, bigint, text),
    recuperar_recebimento(bigint, text, bigint)
FROM labflow_app_web;

COMMIT;
