-- 074 — app: o app chama as funções do arquivo de contra-amostras da 105 do bot (página Arquivo, PB21)
--
-- Faixa do app (050–099). Desfazer: 074_app_grant_arquivo_desfazer.sql. Aplicar com o administrador do banco, depois de um
-- backup. A 105 já dá este GRANT; aqui ele fica do lado do app, como na 069 e na 072, para valer também quando a 050 é
-- desfeita e refeita (o papel labflow_app_web é recriado sem os GRANTs das migrations do bot). As views do arquivo entram
-- no SELECT de todas as tabelas da 050.

BEGIN;

-- condicional: num banco montado do zero a 074 roda antes da 105 (ordem dos números); aí a 105 dá o GRANT
DO $$
DECLARE
    f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['arquivo_arquivar_recebimento(bigint, text, text, int[], int, date, boolean)',
                             'arquivo_descartar(bigint, text, int, boolean)', 'arquivo_caixa_recebimento_sugerida()'] LOOP
        IF to_regprocedure(f) IS NOT NULL THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO labflow_app_web', f);
        END IF;
    END LOOP;
END $$;

COMMIT;
