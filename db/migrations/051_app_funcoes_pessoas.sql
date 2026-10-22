-- 051 — app (web e celular): libera para o app as funções do bot de cadastrar pessoa e trocar cargo (PB5, migration 031)
--
-- Faixa do app (050–099). Spec: 06-api-e-auth.md (v1.0), "Primeiro acesso..." (tela Nova pessoa); 07 §10 Admin. Tarefa: APP-016.
-- Desfazer: 051_app_funcoes_pessoas_desfazer.sql. Depende da 031 (bot) e da 050 (papel labflow_app_web).
-- Aplicar com o usuário administrador do banco, depois de um backup.
--
-- As funções são do bot (SECURITY DEFINER, dono labflow_app, search_path fixo) e conferem por p_quem se quem pede é Admin:
-- o app só ganha o direito de CHAMAR. usuario_exigir_admin (interna) e gravar_cargo_bot (só do bot) NÃO são liberadas.

BEGIN;

GRANT EXECUTE ON FUNCTION cadastrar_usuario(text, text, text, bigint), trocar_cargo(bigint, text, bigint) TO labflow_app_web;

COMMIT;
