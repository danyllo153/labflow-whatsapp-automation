-- 018 — painel: placas de NFC, resultado (ok / não ok) e desvio de tanque em bi.leituras_nfc
--
-- Depende da 013, 016 e 017. Só a view muda (colunas novas no fim, para o CREATE OR REPLACE):
--   placa_1, placa_2, placa_3: o número de cada placa ("<1" = 0, ">300" = 300), para a tendência
--   contagem ("30, 12, 8"), maior (a maior placa), resultado (Ok, Não ok, Pendente, Sem limite ou Sem placas),
--   repeticao (a leitura é de uma repetição) e desvio (Em repetição, Repetição ok ou Repetição não ok)
-- Aplicar: psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 018_bi_placas_nfc.sql

BEGIN;

CREATE OR REPLACE VIEW bi.leituras_nfc AS
WITH l AS (
  SELECT a.*, 'Pré-leitura' AS etapa, a.pre_leitura_prevista AS prevista,
         a.status <> 'Aguardando Pré-Leitura' AS lida, a.pre_leitura_por AS lida_por_id,
         CASE a.sub_analise WHEN 'BL' THEN 'B.L 72h' ELSE 'Psicrotróficos 120h' END AS linha_relatorio,
         'pre'::text AS etapa_placas
  FROM analises a WHERE a.pre_leitura_prevista IS NOT NULL
  UNION ALL
  SELECT a.*, 'Leitura final', a.leitura_final_prevista,
         a.status = 'Concluído', a.leitura_final_por,
         CASE a.sub_analise WHEN 'CT' THEN 'C.T 48h' WHEN 'BL' THEN 'B.L 120h' ELSE 'Psicrotróficos 240h' END,
         'final'::text
  FROM analises a
)
SELECT l.id AS analise_id,
       l.coleta_id,
       CASE c.origem WHEN 'terra' THEN 'Terra' ELSE 'Navio' END AS origem,
       c.tanque,
       trim(n.nome || ' ' || n.viagem) AS navio,
       c.data_coleta,
       l.frasco,
       CASE l.sub_analise WHEN 'CT' THEN 'C.T' WHEN 'BL' THEN 'B.L' ELSE 'Psicrotróficos' END AS analise,
       l.metodo,
       l.etapa,
       l.linha_relatorio,
       l.data_analise,
       l.prevista,
       l.lida,
       u.nome AS lida_por,
       CASE WHEN l.lida THEN 'Lido' WHEN l.prevista < CURRENT_DATE THEN 'Atrasado'
            WHEN l.prevista = CURRENT_DATE THEN 'Vence hoje' ELSE 'No prazo' END AS situacao,
       pl.placa_1,
       pl.placa_2,
       pl.placa_3,
       s.contagem,
       s.maior,
       CASE WHEN s.situacao IN ('Ok', 'Não ok', 'Sem limite') THEN s.situacao
            WHEN l.lida AND COALESCE(s.placas_lidas, 0) = 0 THEN 'Sem placas'
            ELSE 'Pendente' END AS resultado,
       l.repeticao_de IS NOT NULL AS repeticao,
       CASE WHEN dt.id IS NULL THEN NULL
            WHEN dt.status = 'Em repetição' THEN 'Em repetição'
            WHEN dt.resultado = 'Ok' THEN 'Repetição ok'
            ELSE 'Repetição não ok' END AS desvio
FROM l
JOIN coletas c ON c.id = l.coleta_id
LEFT JOIN navios n ON n.id = c.navio_id
LEFT JOIN usuarios u ON u.id = l.lida_por_id
LEFT JOIN vw_situacao_nfc s ON s.analise_id = l.id AND s.etapa = l.etapa_placas
LEFT JOIN desvios_tanque dt ON dt.analise_id = l.id AND dt.etapa = l.etapa_placas
LEFT JOIN LATERAL (
  SELECT max(CASE WHEN p.placa = 1 THEN CASE p.sinal WHEN '<' THEN 0 ELSE p.valor END END) AS placa_1,
         max(CASE WHEN p.placa = 2 THEN CASE p.sinal WHEN '<' THEN 0 ELSE p.valor END END) AS placa_2,
         max(CASE WHEN p.placa = 3 THEN CASE p.sinal WHEN '<' THEN 0 ELSE p.valor END END) AS placa_3
  FROM leituras_placas p
  WHERE p.analise_id = l.id AND p.etapa = l.etapa_placas
) pl ON true;

COMMIT;
