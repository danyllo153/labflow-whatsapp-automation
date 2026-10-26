-- Desfaz a 074_app_grant_arquivo.sql: o app deixa de chamar as funções do arquivo (tire antes a página Arquivo do app).

BEGIN;

-- condicional: num banco montado do zero a 074 roda antes da 105 (ordem dos números); aí a 105 dá o GRANT
DO $$
DECLARE
    f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['arquivo_arquivar_recebimento(bigint, text, text, int[], int, date, boolean)',
                             'arquivo_descartar(bigint, text, int, boolean)', 'arquivo_caixa_recebimento_sugerida()'] LOOP
        IF to_regprocedure(f) IS NOT NULL THEN
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM labflow_app_web', f);
        END IF;
    END LOOP;
END $$;

COMMIT;
