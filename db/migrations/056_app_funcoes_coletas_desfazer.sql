-- Desfaz a 056_app_funcoes_coletas.sql: o app deixa de poder chamar as funções de corrigir, excluir e recuperar coleta.

BEGIN;

REVOKE EXECUTE ON FUNCTION corrigir_coleta(bigint, jsonb, bigint), excluir_coleta(bigint, bigint, text),
    recuperar_coleta(bigint, text, bigint) FROM labflow_app_web;

COMMIT;
