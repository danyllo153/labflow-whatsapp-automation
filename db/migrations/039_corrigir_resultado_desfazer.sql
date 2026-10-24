-- Desfaz a 039: apaga a função de corrigir resultado pelo bot (o histórico gravado fica). Backup antes.
-- Publique antes o workflow sem o comando "corrigir ct do load ..." (senão o bot chama uma função que não existe).
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 039_corrigir_resultado_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS corrigir_resultado_pelo_bot(text, jsonb, text);

COMMIT;
