-- Exemplo FICTÍCIO das famílias de navio do arquivo de contra-amostras (migration 105). As famílias e faixas reais
-- entram pela carga inicial gerada da planilha do laboratório, fora do Git. Aplicar depois da 105 (só em demonstração):
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f arquivo_exemplo.sql
BEGIN;
INSERT INTO arquivo_familias (nome, caixa_de, caixa_ate) VALUES ('O.ALFA', 1, 20), ('O.BETA', 21, 40);
INSERT INTO arquivo_caixas (tipo, numero, familia) SELECT 'navio', g, 'O.ALFA' FROM generate_series(1, 20) g;
INSERT INTO arquivo_caixas (tipo, numero, familia) SELECT 'navio', g, 'O.BETA' FROM generate_series(21, 40) g;
-- uma viagem antiga da planilha (só navio, viagem e a data de descarte) e a reserva dos navios que já existem
INSERT INTO arquivo_navios (caixa, navio, viagem, origem, descarte_carga) VALUES (27, 'O.BETA', '205', 'carga', '2028-10-25');
SELECT arquivo_completar_caixas();
COMMIT;
