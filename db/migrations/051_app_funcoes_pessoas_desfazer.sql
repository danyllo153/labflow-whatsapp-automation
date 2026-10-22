-- Desfaz a 051_app_funcoes_pessoas.sql: o app deixa de poder chamar cadastrar_usuario e trocar_cargo.
-- Não mexe nas funções nem nas tabelas do bot. Aplicar com o usuário administrador do banco.

BEGIN;

REVOKE EXECUTE ON FUNCTION cadastrar_usuario(text, text, text, bigint), trocar_cargo(bigint, text, bigint) FROM labflow_app_web;

COMMIT;
