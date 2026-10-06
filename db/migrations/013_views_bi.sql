-- 013 — views para o Power BI (schema "bi")
--
-- Depende da 001 a 012. Tabelas "prontas para gráfico": uma linha por coisa a
-- acompanhar, com nomes legíveis (sem telefone de ninguém) e a coluna
-- "situacao" já calculada pelo "hoje" de Brasília:
--   Lido/Concluído · Atrasado · Vence hoje · No prazo
-- Lidas pelo usuário somente leitura (labflow_leitura).

BEGIN;

CREATE SCHEMA bi;

-- Coletas de tanque (NFC)
CREATE VIEW bi.coletas AS
SELECT c.id AS coleta_id,
       CASE c.origem WHEN 'terra' THEN 'Terra' ELSE 'Navio' END AS origem,
       c.tanque,
       trim(n.nome || ' ' || n.viagem) AS navio,
       c.data_coleta,
       u.nome AS registrado_por,
       c.registrado_em
FROM coletas c
LEFT JOIN navios n ON n.id = c.navio_id
LEFT JOIN usuarios u ON u.id = c.registrado_por;

-- Leituras de NFC: uma linha por leitura (pré-leitura e leitura final de cada análise)
CREATE VIEW bi.leituras_nfc AS
WITH l AS (
  SELECT a.*, 'Pré-leitura' AS etapa, a.pre_leitura_prevista AS prevista,
         a.status <> 'Aguardando Pré-Leitura' AS lida, a.pre_leitura_por AS lida_por_id,
         CASE a.sub_analise WHEN 'BL' THEN 'B.L 72h' ELSE 'Psicrotróficos 120h' END AS linha_relatorio
  FROM analises a WHERE a.pre_leitura_prevista IS NOT NULL
  UNION ALL
  SELECT a.*, 'Leitura final', a.leitura_final_prevista,
         a.status = 'Concluído', a.leitura_final_por,
         CASE a.sub_analise WHEN 'CT' THEN 'C.T 48h' WHEN 'BL' THEN 'B.L 120h' ELSE 'Psicrotróficos 240h' END
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
            WHEN l.prevista = CURRENT_DATE THEN 'Vence hoje' ELSE 'No prazo' END AS situacao
FROM l
JOIN coletas c ON c.id = l.coleta_id
LEFT JOIN navios n ON n.id = c.navio_id
LEFT JOIN usuarios u ON u.id = l.lida_por_id;

-- Drops D5/D10/D15, com o desvio quando houver
CREATE VIEW bi.drops AS
SELECT d.id AS drop_id,
       d.coleta_id,
       CASE c.origem WHEN 'terra' THEN 'Terra' ELSE 'Navio' END AS origem,
       c.tanque,
       trim(n.nome || ' ' || n.viagem) AS navio,
       c.data_coleta,
       'D' || d.dia AS drop,
       d.data_prevista AS prevista,
       d.status = 'Concluído' AS concluido,
       u.nome AS concluido_por,
       d.concluido_em,
       (x.id IS NOT NULL) AS desvio,
       x.resultado AS desvio_resultado,
       CASE WHEN d.status = 'Concluído' THEN 'Concluído' WHEN d.data_prevista < CURRENT_DATE THEN 'Atrasado'
            WHEN d.data_prevista = CURRENT_DATE THEN 'Vence hoje' ELSE 'No prazo' END AS situacao
FROM drops d
JOIN coletas c ON c.id = d.coleta_id
LEFT JOIN navios n ON n.id = c.navio_id
LEFT JOIN usuarios u ON u.id = d.concluido_por
LEFT JOIN desvios_drop x ON x.drop_id = d.id;

-- Desvios de drop
CREATE VIEW bi.desvios AS
SELECT v.id AS desvio_id,
       CASE v.origem WHEN 'terra' THEN 'Terra' ELSE 'Navio' END AS origem,
       v.tanque,
       v.navio,
       v.data_coleta,
       'D' || v.dia AS drop,
       v.data_abertura,
       v.leitura_prevista AS prazo,
       v.status,
       COALESCE(v.resultado, 'Em confirmação') AS resultado,
       array_to_string(ARRAY(SELECT t || ' °C' FROM unnest(v.temperaturas) AS t ORDER BY t), ', ') AS temperaturas,
       (7 = ANY (v.temperaturas)) AS cresceu_7c,
       (13 = ANY (v.temperaturas)) AS cresceu_13c,
       (25 = ANY (v.temperaturas)) AS cresceu_25c,
       v.aberto_por,
       v.resultado_por,
       (v.resultado_em AT TIME ZONE 'America/Sao_Paulo')::date AS data_resultado,
       CASE WHEN v.status = 'Concluído' THEN 'Concluído' WHEN v.leitura_prevista < CURRENT_DATE THEN 'Atrasado'
            WHEN v.leitura_prevista = CURRENT_DATE THEN 'Vence hoje' ELSE 'No prazo' END AS situacao
FROM vw_desvios_drop v;

-- C.T e B.L do concentrado: uma linha por lote/amostra e análise prevista, com o resultado se já houver
CREATE VIEW bi.contagens AS
SELECT CASE vp.origem WHEN 'recebimento' THEN 'Recebimento' ELSE 'Embarque' END AS origem,
       l.numero AS load,
       it.codigo AS item,
       fb.nome AS fabrica,
       trim(nv.nome || ' ' || nv.viagem) AS navio,
       e.linha,
       e.fase,
       CASE WHEN vp.origem = 'embarque' THEN 'A' || vp.numero ELSE vp.numero::text END AS lote_amostra,
       vp.numero,
       CASE vp.analise WHEN 'CT' THEN 'C.T 48h' WHEN 'BL72' THEN 'B.L 72h' ELSE 'B.L 120h' END AS analise,
       vp.prevista,
       (c.id IS NOT NULL) AS lido,
       c.resultado,
       c.sinal,
       c.valor,
       COALESCE(c.alarme, false) AS alarme,
       u.nome AS lido_por,
       (c.lido_em AT TIME ZONE 'America/Sao_Paulo')::date AS data_leitura,
       CASE WHEN c.id IS NOT NULL THEN 'Lido' WHEN vp.prevista < CURRENT_DATE THEN 'Atrasado'
            WHEN vp.prevista = CURRENT_DATE THEN 'Vence hoje' ELSE 'No prazo' END AS situacao
FROM vw_contagens_previstas vp
JOIN loads l ON l.id = vp.load_id
LEFT JOIN itens it ON it.id = l.item_id
LEFT JOIN fabricas fb ON fb.id = l.fabrica_id
LEFT JOIN embarque_amostras ea ON ea.id = vp.embarque_amostra_id
LEFT JOIN embarques e ON e.id = ea.embarque_id
LEFT JOIN navios nv ON nv.id = e.navio_id
LEFT JOIN vw_contagens c ON c.analise = vp.analise
     AND (c.recebimento_lote_id = vp.recebimento_lote_id OR c.embarque_amostra_id = vp.embarque_amostra_id)
LEFT JOIN usuarios u ON u.id = c.lido_por;

-- TAB, Coliformes e Howard (composta, tanque de NFC ou lote/amostra de composta aberta)
CREATE VIEW bi.testes AS
WITH t AS (
  SELECT t.*,
         COALESCE(CASE WHEN t.status = 'No caldo' THEN t.espalhar_prevista
                       WHEN t.status = 'Em confirmação' THEN t.confirmacao_prevista
                       ELSE t.leitura_prevista END, t.data_feito) AS proxima_etapa
  FROM testes t
)
SELECT t.id AS teste_id,
       CASE t.tipo WHEN 'COLIFORMES' THEN 'Coliformes' WHEN 'HOWARD' THEN 'Howard' ELSE 'TAB' END AS teste,
       CASE WHEN t.coleta_id IS NOT NULL THEN 'Tank farm'
            WHEN v.origem = 'embarque' THEN 'Embarque' ELSE 'Recebimento' END AS origem,
       CASE WHEN t.coleta_id IS NOT NULL THEN 'Tanque ' || co.tanque
            WHEN t.teste_pai_id IS NOT NULL THEN 'Lote/amostra de composta aberta'
            ELSE 'Composta #' || v.id END AS alvo,
       v.id AS composta,
       v.load,
       v.item,
       v.fabrica,
       v.rotulo AS embarque,
       array_to_string(v.lotes, ',') AS lotes,
       co.tanque,
       co.data_coleta,
       (t.teste_pai_id IS NOT NULL) AS confirmacao_por_lote,
       CASE t.status WHEN 'Incubada' THEN 'Incubado' WHEN 'Estriada' THEN 'Estriado'
                     WHEN 'Concluída' THEN 'Concluído' ELSE t.status END AS status,
       t.resultado,
       t.percentual AS howard_percentual,
       (t.resultado = 'Positivo') AS positivo,
       t.data_feito,
       t.proxima_etapa,
       uf.nome AS feito_por,
       ur.nome AS resultado_por,
       (t.resultado_em AT TIME ZONE 'America/Sao_Paulo')::date AS data_resultado,
       CASE WHEN t.status = 'Concluída' THEN 'Concluído' WHEN t.proxima_etapa < CURRENT_DATE THEN 'Atrasado'
            WHEN t.proxima_etapa = CURRENT_DATE THEN 'Vence hoje' ELSE 'No prazo' END AS situacao
FROM t
LEFT JOIN testes pai ON pai.id = t.teste_pai_id
LEFT JOIN vw_compostas v ON v.id = COALESCE(t.composta_id, pai.composta_id)
LEFT JOIN coletas co ON co.id = t.coleta_id
LEFT JOIN usuarios uf ON uf.id = t.feito_por
LEFT JOIN usuarios ur ON ur.id = t.resultado_por;

-- acesso do usuário somente leitura (Power BI e DBeaver)
GRANT USAGE ON SCHEMA bi TO labflow_leitura;
GRANT SELECT ON ALL TABLES IN SCHEMA bi TO labflow_leitura;
ALTER DEFAULT PRIVILEGES FOR ROLE labflow_app IN SCHEMA bi GRANT SELECT ON TABLES TO labflow_leitura;

COMMIT;
