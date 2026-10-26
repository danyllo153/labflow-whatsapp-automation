-- Desfaz a 075_app_incubacao_remanejar.sql: o lugar do dia volta a não mudar (tire antes o remanejar do app).

BEGIN;

REVOKE UPDATE, DELETE ON app.incubacao_dias FROM labflow_app_web;
DROP TRIGGER IF EXISTS incubacao_dias_so_folha_aberta ON app.incubacao_dias;
DROP FUNCTION IF EXISTS app.incubacao_dias_folha_impressa();

COMMIT;
