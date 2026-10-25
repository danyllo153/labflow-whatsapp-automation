-- Desfaz a 106. Publique ANTES o workflow anterior (o "BD · Buscar usuários" da 106 lê navio_apelidos). Backup antes.
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 106_pendencias_do_dia_apelidos_navio_desfazer.sql

BEGIN;

DROP FUNCTION IF EXISTS pendencias_do_dia_texto();
DROP VIEW IF EXISTS vw_pendencias_do_dia;
DROP TRIGGER IF EXISTS navios_apelido ON navios;
DROP FUNCTION IF EXISTS navios_nome_oficial(), navio_nome_oficial(text);
DROP TABLE IF EXISTS navio_apelidos;

COMMIT;
