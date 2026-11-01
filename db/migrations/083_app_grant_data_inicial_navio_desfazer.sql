-- Desfaz a 083_app_grant_data_inicial_navio.sql: o app deixa de chamar arquivo_data_inicial_navio (tire antes o botão
-- "Data inicial" da página Arquivo).

BEGIN;

DO $$
BEGIN
    IF to_regprocedure('arquivo_data_inicial_navio(bigint, int, date, boolean)') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION arquivo_data_inicial_navio(bigint, int, date, boolean) FROM labflow_app_web;
    END IF;
    IF to_regclass('vw_arquivo_inicio_navio') IS NOT NULL THEN
        REVOKE SELECT ON vw_arquivo_inicio_navio FROM labflow_app_web;
    END IF;
END $$;

COMMIT;
