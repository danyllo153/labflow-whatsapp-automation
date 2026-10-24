-- Desfaz a 043: apaga as funções de compostas, TAB, Coliformes e Howard e as portas de entrada do bot. Backup antes.
-- Publique antes o workflow que ainda grava esses testes pelo SQL próprio, e desfaça a migration do app que deu o GRANT ao
-- labflow_app_web, se houver.
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 043_testes_funcoes_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS teste_acao_pelo_bot(text, jsonb);
DROP FUNCTION IF EXISTS teste_feito_pelo_bot(text, text, jsonb, text);
DROP FUNCTION IF EXISTS compostas_criar_pelo_bot(text, text, text, jsonb);
DROP FUNCTION IF EXISTS teste_acao(bigint, text, text, bigint[], text, numeric);
DROP FUNCTION IF EXISTS teste_feito(bigint, text, bigint[], date, boolean);
DROP FUNCTION IF EXISTS criar_compostas(bigint, text, text, jsonb, boolean);

COMMIT;
