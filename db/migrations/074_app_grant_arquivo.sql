-- 074 — app: o app chama as funções do arquivo de contra-amostras da 105 do bot (página Arquivo, PB21)
--
-- Faixa do app (050–099). Desfazer: 074_app_grant_arquivo_desfazer.sql. Aplicar com o administrador do banco, depois de um
-- backup. A 105 já dá este GRANT; aqui ele fica do lado do app, como na 069 e na 072, para valer também quando a 050 é
-- desfeita e refeita (o papel labflow_app_web é recriado sem os GRANTs das migrations do bot). As views do arquivo entram
-- no SELECT de todas as tabelas da 050.

BEGIN;

GRANT EXECUTE ON FUNCTION
    arquivo_arquivar_recebimento(bigint, text, text, int[], int, date, boolean),
    arquivo_descartar(bigint, text, int, boolean),
    arquivo_caixa_recebimento_sugerida()
TO labflow_app_web;

COMMIT;
