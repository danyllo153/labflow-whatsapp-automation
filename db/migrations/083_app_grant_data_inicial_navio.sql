-- 083 — app: o app chama arquivo_data_inicial_navio da 109 do bot (botão "Data inicial" da caixa de navio, PB24)
--
-- Faixa do app (050–099). Desfazer: 083_app_grant_data_inicial_navio_desfazer.sql. Aplicar com o administrador do banco,
-- depois de um backup. A 109 já dá este GRANT; aqui ele fica do lado do app, como na 074, para valer também quando a 050 é
-- desfeita e refeita (o papel labflow_app_web é recriado sem os GRANTs das migrations do bot).

BEGIN;

-- condicional: num banco montado do zero a 083 roda antes da 109 (ordem dos números); aí a 109 dá o GRANT
DO $$
BEGIN
    IF to_regprocedure('arquivo_data_inicial_navio(bigint, int, date, boolean)') IS NOT NULL THEN
        GRANT EXECUTE ON FUNCTION arquivo_data_inicial_navio(bigint, int, date, boolean) TO labflow_app_web;
    END IF;
    IF to_regclass('vw_arquivo_inicio_navio') IS NOT NULL THEN
        GRANT SELECT ON vw_arquivo_inicio_navio TO labflow_app_web;
    END IF;
END $$;

COMMIT;
