-- Desfaz a 105 (arquivo de contra-amostras). Publique antes o workflow anterior (sem os comandos do arquivo). Backup antes:
-- as caixas, a carga inicial e o que foi arquivado ou descartado pela 105 se perdem (os bags e potes da arquivo_amostras ficam).
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 105_arquivo_contra_amostras_desfazer.sql

BEGIN;

DROP TRIGGER IF EXISTS arquivo_reservar_caixa ON navios;
DROP FUNCTION IF EXISTS arquivo_pelo_bot(text, jsonb, text), arquivo_consulta(jsonb), arquivo_descartar(bigint, text, int, boolean),
    arquivo_arquivar_recebimento(bigint, text, text, int[], int, date, boolean), arquivo_caixa_recebimento_sugerida(),
    arquivo_completar_caixas(), arquivo_navio_novo(), arquivo_reservar_navio(bigint);
DROP VIEW IF EXISTS vw_arquivo_caixas, vw_arquivo_itens;
DROP FUNCTION IF EXISTS arquivo_familia(text), arquivo_viagem(text), arquivo_nome_navio(text);
DROP TABLE IF EXISTS arquivo_recebimento, arquivo_navios, arquivo_caixas, arquivo_familias;

COMMIT;
