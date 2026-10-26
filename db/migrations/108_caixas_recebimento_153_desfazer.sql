-- Desfaz a 108 (caixas do recebimento de 121 a 153). Só funciona se nada foi arquivado nas caixas 146 a 153 do recebimento.
-- As caixas 146 a 153 voltam a ser de navio da família que começa na 154 (ela volta a começar na 146) e as funções da 105 voltam
-- ao texto "121 a 145": depois de rodar este arquivo, rode de novo o trecho das funções arquivo_arquivar_recebimento,
-- arquivo_descartar e arquivo_consulta da 105 (ou aplique a 105 inteira num banco novo). Backup antes.
--   psql -U $POSTGRES_USER -d labflow -v ON_ERROR_STOP=1 -f 108_caixas_recebimento_153_desfazer.sql

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM arquivo_recebimento WHERE caixa BETWEEN 146 AND 153) THEN
        RAISE EXCEPTION 'Há load arquivado (ou descartado) numa caixa de 146 a 153 do recebimento. Nada foi alterado.';
    END IF;
END $$;

DELETE FROM arquivo_caixas WHERE tipo = 'recebimento' AND numero BETWEEN 146 AND 153;
INSERT INTO arquivo_caixas (tipo, numero, familia)
SELECT 'navio', g, f.nome FROM arquivo_familias f, generate_series(146, 153) g WHERE f.caixa_de = 154;
UPDATE arquivo_familias SET caixa_de = 146 WHERE caixa_de = 154;

COMMIT;
