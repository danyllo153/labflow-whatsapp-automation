-- 038 — dia da incubação para o laudo de incubação e leitura do app (pedido PB10 da sessão do app, 24/10/2026)
--
-- Depende da 015 (bi.testes) e da 027 (recebimento NFC). Só aditiva: nenhuma tabela muda. Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 038_bi_incubacao.sql
-- Desfazer: 038_bi_incubacao_desfazer.sql.
--
-- Resposta do PB10 (conferida no banco em 24/10/2026) e decisão do Danyllo: o recebimento e o embarque plaqueiam no mesmo dia em que
-- chegam; o recebimento NFC tem a data do comando, que já é a da análise; nos tanques a data da análise (o dia em que o analista
-- decide analisar, nem sempre o da coleta) já está em analises.data_analise, e N/ST em analises.frasco. Por isso NÃO entra coluna
-- nova de plaqueamento; só faltava mostrar:
--   1) bi.testes ganha espalhado_em e espalhado_por NO FIM (o Power BI e o app não perdem as colunas atuais);
--   2) bi.incubacao: uma linha por plaqueamento (tanque N/ST, recebimento, embarque, recebimento NFC, TAB, Coliformes).
-- O SELECT para o labflow_leitura e o labflow_app_web vem dos privilégios padrão do schema bi (013 e 050).

BEGIN;

CREATE OR REPLACE VIEW bi.testes AS
WITH t AS (
  SELECT t.*,
         COALESCE(CASE WHEN t.status = 'No caldo' THEN t.espalhar_prevista
                       WHEN t.status = 'Em confirmação' THEN COALESCE(f.proxima, t.confirmacao_prevista)
                       ELSE t.leitura_prevista END, t.data_feito) AS proxima_etapa
  FROM testes t
  -- composta aberta: a próxima data é a do lote mais adiantado que ainda não terminou
  LEFT JOIN LATERAL (
    SELECT min(CASE WHEN fi.status = 'No caldo' THEN fi.espalhar_prevista ELSE fi.leitura_prevista END) AS proxima
    FROM testes fi
    WHERE fi.teste_pai_id = t.id AND fi.status <> 'Concluída'
  ) f ON t.status = 'Em confirmação'
)
SELECT t.id AS teste_id,
       CASE t.tipo WHEN 'COLIFORMES' THEN 'Coliformes' WHEN 'HOWARD' THEN 'Howard' ELSE 'TAB' END AS teste,
       CASE WHEN t.coleta_id IS NOT NULL THEN 'Tank farm'
            WHEN v.origem = 'embarque' THEN 'Embarque' ELSE 'Recebimento' END AS origem,
       CASE WHEN t.coleta_id IS NOT NULL THEN 'Tanque ' || co.tanque
            WHEN t.recebimento_lote_id IS NOT NULL THEN 'Composta #' || v.id || ', lote ' || rl.lote
            WHEN t.embarque_amostra_id IS NOT NULL THEN 'Composta #' || v.id || ', amostra A' || ea.numero
            ELSE 'Composta #' || v.id END AS alvo,
       v.id AS composta,
       v.load,
       v.item,
       v.fabrica,
       v.rotulo AS embarque,
       CASE WHEN t.recebimento_lote_id IS NOT NULL THEN rl.lote::text
            WHEN t.embarque_amostra_id IS NOT NULL THEN 'A' || ea.numero
            ELSE array_to_string(v.lotes, ',') END AS lotes,
       co.tanque,
       co.data_coleta,
       (t.teste_pai_id IS NOT NULL) AS confirmacao_por_lote,
       CASE WHEN t.tipo = 'COLIFORMES' AND t.status = 'Em confirmação' AND t.teste_pai_id IS NULL THEN 'Positivo, em confirmação'
            ELSE CASE t.status WHEN 'Incubada' THEN 'Incubado' WHEN 'Estriada' THEN 'Estriado'
                               WHEN 'Concluída' THEN 'Concluído' ELSE t.status END END AS status,
       t.resultado,
       t.percentual AS howard_percentual,
       (t.resultado = 'Positivo') AS positivo,
       t.data_feito,
       t.proxima_etapa,
       uf.nome AS feito_por,
       ur.nome AS resultado_por,
       (t.resultado_em AT TIME ZONE 'America/Sao_Paulo')::date AS data_resultado,
       CASE WHEN t.status = 'Concluída' THEN 'Concluído' WHEN t.proxima_etapa < CURRENT_DATE THEN 'Atrasado'
            WHEN t.proxima_etapa = CURRENT_DATE THEN 'Vence hoje' ELSE 'No prazo' END AS situacao,
       t.espalhar_prevista,
       t.leitura_prevista,
       CASE WHEN t.status = 'Em confirmação' THEN t.confirmacao_prevista END AS confirmacao_prevista,
       -- nova (015): código do bot (#12 para a composta, #12.3 para o lote 3 da composta aberta)
       CASE WHEN t.coleta_id IS NOT NULL THEN NULL
            WHEN t.recebimento_lote_id IS NOT NULL THEN '#' || v.id || '.' || rl.lote
            WHEN t.embarque_amostra_id IS NOT NULL THEN '#' || v.id || '.' || ea.numero
            ELSE '#' || v.id END AS codigo,
       -- novas (015): navio abreviado só no embarque ("D.SKY 123 L2 F3"; vazio fora dele) e o load
       -- (no TAB do tank farm, o tanque), para as tabelas de TAB e Coliformes
       CASE WHEN v.origem = 'embarque'
            THEN regexp_replace(v.rotulo, ' linha (\d+) fase (\d+)$', ' L\1 F\2') END AS navio_fase,
       CASE WHEN t.coleta_id IS NOT NULL THEN 'Tanque ' || co.tanque ELSE v.load::text END AS load_ou_tanque,
       -- novas (038, pedido PB10 do app): quando o TAB foi espalhado / o Coliformes estriado (o plaqueamento) e por quem
       (t.espalhado_em AT TIME ZONE 'America/Sao_Paulo') AS espalhado_em,
       ue.nome AS espalhado_por
FROM t
LEFT JOIN testes pai ON pai.id = t.teste_pai_id
LEFT JOIN vw_compostas v ON v.id = COALESCE(t.composta_id, pai.composta_id)
LEFT JOIN recebimento_lotes rl ON rl.id = t.recebimento_lote_id
LEFT JOIN embarque_amostras ea ON ea.id = t.embarque_amostra_id
LEFT JOIN coletas co ON co.id = t.coleta_id
LEFT JOIN usuarios uf ON uf.id = t.feito_por
LEFT JOIN usuarios ur ON ur.id = t.resultado_por
LEFT JOIN usuarios ue ON ue.id = t.espalhado_por;

-- uma linha por plaqueamento (o dia em que a amostra entrou para incubar), para o laudo de incubação e leitura do app
--   tipo: Tanque | Recebimento | Embarque | Recebimento NFC | TAB | Coliformes  (Howard não incuba: fica de fora)
--   dia_incubacao: tanque = data_analise (o dia que o analista diz no comando de análise, nem sempre o da coleta);
--     recebimento e embarque = o dia que chega (decidido em 24/10/2026: plaqueia no mesmo dia); recebimento NFC = a data do
--     comando (é a da análise); TAB e Coliformes = o dia do caldo (data_feito); o espalhar/estriar fica em espalhar_prevista e espalhado_em
--   frasco: N (normal) ou ST (stress) nos tanques; fresh ou past no NFC
CREATE OR REPLACE VIEW bi.incubacao AS
SELECT 'Tanque'::text AS tipo,
       a.data_analise AS dia_incubacao,
       CASE a.frasco WHEN 'Normal' THEN 'N' WHEN 'Stress' THEN 'ST' ELSE a.frasco END AS frasco,
       CASE c.origem WHEN 'terra' THEN 'Terra' ELSE 'Navio' END AS origem,
       CASE WHEN c.origem = 'terra' THEN 'Tanque ' || c.tanque ELSE n.nome || ' ' || n.viagem || ' tanque ' || c.tanque END AS alvo,
       NULL::text AS load, NULL::text AS item, NULL::text AS fabrica,
       a.sub_analise || ' ' || a.metodo AS analise,
       a.pre_leitura_prevista, a.leitura_final_prevista AS leitura_prevista,
       NULL::date AS espalhar_prevista, NULL::timestamp AS espalhado_em,
       a.status AS situacao, 'analises'::text AS tabela, a.id AS registro_id
FROM analises a
JOIN coletas c ON c.id = a.coleta_id
LEFT JOIN navios n ON n.id = c.navio_id
UNION ALL
SELECT 'Recebimento', r.data_recebimento, NULL, 'Recebimento', 'Load ' || l.numero || ' lote ' || r.lote,
       l.numero, i.codigo, f.nome, x.analise, NULL::date, r.data_recebimento + x.dias, NULL::date, NULL::timestamp,
       CASE WHEN EXISTS (SELECT 1 FROM contagens k WHERE k.recebimento_lote_id = r.id AND k.analise = x.cod) THEN 'Lido' ELSE 'Pendente' END,
       'recebimento_lotes', r.id
FROM recebimento_lotes r
JOIN loads l ON l.id = r.load_id
JOIN itens i ON i.id = l.item_id
LEFT JOIN fabricas f ON f.id = l.fabrica_id
CROSS JOIN (VALUES ('CT', 'C.T 48h', 2), ('BL72', 'B.L 72h', 3), ('BL120', 'B.L 120h', 5)) AS x(cod, analise, dias)
UNION ALL
SELECT 'Embarque', ea.data_embarque, NULL, 'Embarque',
       n.nome || ' ' || n.viagem || ' L' || e.linha || ' F' || e.fase || ' A' || ea.numero,
       l.numero, i.codigo, f.nome, x.analise, NULL::date, ea.data_embarque + x.dias, NULL::date, NULL::timestamp,
       CASE WHEN EXISTS (SELECT 1 FROM contagens k WHERE k.embarque_amostra_id = ea.id AND k.analise = x.cod) THEN 'Lido' ELSE 'Pendente' END,
       'embarque_amostras', ea.id
FROM embarque_amostras ea
JOIN embarques e ON e.id = ea.embarque_id
JOIN navios n ON n.id = e.navio_id
JOIN loads l ON l.id = ea.load_id
JOIN itens i ON i.id = l.item_id
LEFT JOIN fabricas f ON f.id = l.fabrica_id
CROSS JOIN (VALUES ('CT', 'C.T 48h', 2), ('BL72', 'B.L 72h', 3), ('BL120', 'B.L 120h', 5)) AS x(cod, analise, dias)
UNION ALL
SELECT 'Recebimento NFC', rn.data_recebimento, rn.amostra, 'Recebimento NFC',
       'Load ' || l.numero || ' lote ' || rn.lote || ' ' || rn.amostra || ' 10^' || rn.diluicao,
       l.numero, i.codigo, f.nome, x.analise, NULL::date, rn.data_recebimento + x.dias, NULL::date, NULL::timestamp,
       CASE WHEN EXISTS (SELECT 1 FROM contagens_nfc k WHERE k.recebimento_nfc_id = rn.id AND k.analise = x.cod) THEN 'Lido' ELSE 'Pendente' END,
       'recebimento_nfc', rn.id
FROM recebimento_nfc rn
JOIN loads l ON l.id = rn.load_id
JOIN itens i ON i.id = l.item_id
LEFT JOIN fabricas f ON f.id = l.fabrica_id
CROSS JOIN (VALUES ('CT', 'C.T 48h', 2), ('BL72', 'B.L 72h', 3), ('BL120', 'B.L 120h', 5)) AS x(cod, analise, dias)
UNION ALL
SELECT CASE t.tipo WHEN 'COLIFORMES' THEN 'Coliformes' ELSE 'TAB' END, t.data_feito, NULL,
       CASE WHEN t.coleta_id IS NOT NULL THEN 'Tank farm' WHEN v.origem = 'embarque' THEN 'Embarque' ELSE 'Recebimento' END,
       CASE WHEN t.coleta_id IS NOT NULL THEN 'Tanque ' || co.tanque
            WHEN t.recebimento_lote_id IS NOT NULL THEN 'Composta #' || v.id || ', lote ' || rl.lote
            WHEN t.embarque_amostra_id IS NOT NULL THEN 'Composta #' || v.id || ', amostra A' || ea.numero
            ELSE 'Composta #' || v.id END,
       v.load::text, v.item::text, NULL::text,
       CASE t.tipo WHEN 'COLIFORMES' THEN 'Coliformes' ELSE 'TAB' END,
       NULL::date, t.leitura_prevista, t.espalhar_prevista, (t.espalhado_em AT TIME ZONE 'America/Sao_Paulo'),
       t.status, 'testes', t.id
FROM testes t
LEFT JOIN testes pai ON pai.id = t.teste_pai_id
LEFT JOIN vw_compostas v ON v.id = COALESCE(t.composta_id, pai.composta_id)
LEFT JOIN recebimento_lotes rl ON rl.id = t.recebimento_lote_id
LEFT JOIN embarque_amostras ea ON ea.id = t.embarque_amostra_id
LEFT JOIN coletas co ON co.id = t.coleta_id
WHERE t.tipo IN ('TAB', 'COLIFORMES');

COMMIT;
