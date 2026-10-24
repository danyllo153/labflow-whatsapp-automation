-- 068 — app: o app (labflow_app_web) chama as funções de registrar recebimento e lançar C.T/B.L da 040 do bot
--
-- Faixa do app (050–099). Fase E, passo E2 (rumo-do-app.md). Tarefa: APP-057. Depende da 040 (sessão do bot, PB11).
-- Desfazer: 068_app_grant_recebimento_registrar_lancar_desfazer.sql. Aplicar com o administrador do banco, depois de um backup.
-- As regras (quem pode, fábricas, lote repetido, alarme, prévia "o que vai ser criado") moram nas funções; o app só chama.

BEGIN;

GRANT EXECUTE ON FUNCTION lista_compacta(int[]),
                          registrar_recebimento(bigint, text, text, text, int[], date, boolean, boolean),
                          lancar_contagem(bigint, text, jsonb, boolean) TO labflow_app_web;

COMMIT;
