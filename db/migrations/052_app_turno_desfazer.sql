-- Desfaz a 052_app_turno.sql: apaga as tabelas do turno do app (turnos, entradas, relatórios, atividades fixas e feitas).
-- Não mexe em nenhuma tabela do bot. Fazer backup antes (apaga o que foi registrado no turno). Aplicar com o administrador do banco.

BEGIN;

DROP TABLE IF EXISTS app.atividades_feitas, app.atividades_fixas, app.relatorios_turno, app.entradas_turno, app.turnos;

COMMIT;
