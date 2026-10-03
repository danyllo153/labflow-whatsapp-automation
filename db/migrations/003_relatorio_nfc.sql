-- 003 — relatório do dia, blocos de NFC (tank farm e navio)
--
-- Depende da 001. Aplicar com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 003_relatorio_nfc.sql
--
-- Uma linha por tanque em cada linha do relatório diário de microbiologia
-- (ver docs/concentrado.md, seções 1 e 7). Mapeamento das leituras:
--   C.T 48h             = leitura final do CT
--   B.L 72h / 120h      = pré-leitura / leitura final do BL
--   Psicrotróficos 120h / 240h = pré-leitura / leitura final do WORT
--   Drop 5 / 10 / 15    = drops D5, D10, D15
-- "lido" só é verdadeiro quando todas as linhas do tanque naquela leitura
-- foram feitas (o WORT tem Profundidade e Superfície).

BEGIN;

CREATE OR REPLACE VIEW vw_relatorio_nfc AS
WITH leituras AS (
    SELECT a.pre_leitura_prevista AS dia,
           a.frasco AS amostra,
           CASE a.sub_analise WHEN 'BL' THEN 'B.L 72h' ELSE 'Psicrotróficos 120h' END AS linha,
           a.coleta_id,
           a.status <> 'Aguardando Pré-Leitura' AS lido
    FROM analises a
    WHERE a.pre_leitura_prevista IS NOT NULL
  UNION ALL
    SELECT a.leitura_final_prevista,
           a.frasco,
           CASE a.sub_analise WHEN 'CT' THEN 'C.T 48h' WHEN 'BL' THEN 'B.L 120h' ELSE 'Psicrotróficos 240h' END,
           a.coleta_id,
           a.status = 'Concluído'
    FROM analises a
  UNION ALL
    SELECT d.data_prevista, 'Drops', 'Drop ' || d.dia, d.coleta_id, d.status = 'Concluído'
    FROM drops d
)
SELECT l.dia,
       CASE c.origem WHEN 'terra' THEN 'Tank farm' ELSE 'Navio' END AS bloco,
       l.amostra,
       l.linha,
       CASE l.linha
           WHEN 'C.T 48h'             THEN 1
           WHEN 'B.L 72h'             THEN 2
           WHEN 'B.L 120h'            THEN 3
           WHEN 'Psicrotróficos 120h' THEN 4
           WHEN 'Psicrotróficos 240h' THEN 5
           WHEN 'Drop 5'              THEN 6
           WHEN 'Drop 10'             THEN 7
           ELSE 8
       END AS ordem,
       trim(n.nome || ' ' || n.viagem) AS navio,
       c.tanque,
       bool_and(l.lido) AS lido
FROM leituras l
JOIN coletas c ON c.id = l.coleta_id
LEFT JOIN navios n ON n.id = c.navio_id
GROUP BY l.dia, c.origem, l.amostra, l.linha, n.nome, n.viagem, c.tanque;

COMMIT;
