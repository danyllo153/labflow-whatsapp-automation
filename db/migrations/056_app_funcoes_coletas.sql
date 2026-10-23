-- 056 — app (web e celular): libera para o app as funções do bot de corrigir, excluir e recuperar coleta (PB4, migrations 033 e 034)
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md (v1.0), "Regras que valem para todas as telas" e "Permissões"; 08 A11. Tarefa: APP-029.
-- Desfazer: 056_app_funcoes_coletas_desfazer.sql. Depende da 033/034 (bot) e da 050 (papel labflow_app_web).
-- Aplicar com o usuário administrador do banco, depois de um backup.
--
-- As funções são do bot (SECURITY DEFINER, dono labflow_app, search_path fixo) e conferem por p_quem quem pode mexer
-- (Admin e Operador em qualquer coleta; o Coletor só na que ele registrou e sem análise, drop concluído ou TAB; recuperar só Admin):
-- o app só ganha o direito de CHAMAR. coleta_exigir_permissao (interna) NÃO é liberada. Excluir arquiva (nada se apaga).

BEGIN;

GRANT EXECUTE ON FUNCTION corrigir_coleta(bigint, jsonb, bigint), excluir_coleta(bigint, bigint, text),
    recuperar_coleta(bigint, text, bigint) TO labflow_app_web;

COMMIT;
