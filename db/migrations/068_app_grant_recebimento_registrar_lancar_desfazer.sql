-- Desfaz a 068_app_grant_recebimento_registrar_lancar.sql: o app deixa de chamar as funções da 040.

BEGIN;

REVOKE EXECUTE ON FUNCTION lista_compacta(int[]),
                           registrar_recebimento(bigint, text, text, text, int[], date, boolean, boolean),
                           lancar_contagem(bigint, text, jsonb, boolean) FROM labflow_app_web;

COMMIT;
