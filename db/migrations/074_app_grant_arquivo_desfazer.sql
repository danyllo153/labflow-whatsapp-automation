-- Desfaz a 074_app_grant_arquivo.sql: o app deixa de chamar as funções do arquivo (tire antes a página Arquivo do app).

BEGIN;

REVOKE EXECUTE ON FUNCTION
    arquivo_arquivar_recebimento(bigint, text, text, int[], int, date, boolean),
    arquivo_descartar(bigint, text, int, boolean),
    arquivo_caixa_recebimento_sugerida()
FROM labflow_app_web;

COMMIT;
