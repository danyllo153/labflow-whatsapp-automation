-- Desfaz a 067_app_funcoes_bot_esterilizacao_aguas.sql: tira as funções do bot (os registros feitos por elas ficam).

BEGIN;

DROP FUNCTION IF EXISTS app.bot_lancar_superficie(bigint, text, text, jsonb, bigint);
DROP FUNCTION IF EXISTS app.bot_coletar_superficie(bigint, text, text[], timestamptz, date, text);
DROP FUNCTION IF EXISTS app.bot_lancar_agua(bigint, jsonb, jsonb, bigint);
DROP FUNCTION IF EXISTS app.bot_coletar_agua(bigint, text[], timestamptz, text);
DROP FUNCTION IF EXISTS app.bot_registrar_esterilizacao(bigint, text[], text, text, text, timestamptz);
DROP FUNCTION IF EXISTS app.bot_pagina_aguas(text);
DROP FUNCTION IF EXISTS app.bot_pagina_esterilizacao(date, text);
DROP FUNCTION IF EXISTS app.bot_turno(bigint, timestamptz);
DROP FUNCTION IF EXISTS app.bot_resultado(text);
DROP FUNCTION IF EXISTS app.bot_exigir(bigint, text[]);

COMMIT;
