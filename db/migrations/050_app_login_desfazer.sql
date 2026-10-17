-- Desfaz a 050_app_login.sql: apaga o schema "app" (credenciais, senhas provisórias e sessões do app)
-- e o papel labflow_app_web. NÃO mexe em nenhuma tabela do bot.
-- Fazer backup antes. Aplicar com o usuário administrador do banco.

BEGIN;

DROP SCHEMA IF EXISTS app CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'labflow_app_web') THEN
    ALTER DEFAULT PRIVILEGES FOR ROLE labflow_app IN SCHEMA public REVOKE SELECT ON TABLES FROM labflow_app_web;
    ALTER DEFAULT PRIVILEGES FOR ROLE labflow_app IN SCHEMA bi REVOKE SELECT ON TABLES FROM labflow_app_web;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM labflow_app_web;
    REVOKE ALL ON ALL TABLES IN SCHEMA bi FROM labflow_app_web;
    REVOKE ALL ON SCHEMA public, bi FROM labflow_app_web;
    DROP ROLE labflow_app_web;
  END IF;
END $$;

COMMIT;
