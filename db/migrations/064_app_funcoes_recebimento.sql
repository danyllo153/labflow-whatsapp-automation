-- 064 — app (web e celular): o app passa a CHAMAR as funções do bot para corrigir e excluir recebimento (FCOJ)
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md (v1.0), §5 Páginas (Recebimento). Tarefa: APP-045.
-- Desfazer: 064_app_funcoes_recebimento_desfazer.sql. Depende da 036 (funções da sessão do bot, PB4).
-- As funções conferem o cargo de quem pede (Admin e Analista; recuperar só Admin) e guardam o histórico.

BEGIN;

GRANT EXECUTE ON FUNCTION
    corrigir_recebimento(bigint, jsonb, bigint, text),
    corrigir_load(bigint, jsonb, bigint, text),
    excluir_recebimento(bigint, bigint, text),
    recuperar_recebimento(bigint, text, bigint)
TO labflow_app_web;

COMMIT;
