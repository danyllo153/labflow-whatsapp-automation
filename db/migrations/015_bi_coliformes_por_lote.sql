-- 015 — bi.testes mostra a composta aberta lote a lote (Coliformes)
--
-- Depende da 014. Só a view bi.testes muda (nenhuma tabela):
--   * lote/amostra de composta aberta: "alvo" diz qual ("Composta #12, lote 3"), "lotes" traz só o
--     dele ("3" ou "A3") e a coluna nova "codigo" usa o código do bot ("#12.3"; composta = "#12")
--   * Coliformes em confirmação (deu positivo na leitura e a composta foi aberta): status
--     "Positivo, em confirmação" e a próxima etapa é a
--     próxima data dos lotes abertos (estriar ou ler), calculada pelos próprios lotes
-- Regra (docs/concentrado.md): cada lote é confirmado sozinho; a composta é positiva se algum lote
-- der positivo e só é concluída quando todos os lotes têm resultado.
-- Aplicar: psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 015_bi_coliformes_por_lote.sql

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
       CASE WHEN t.coleta_id IS NOT NULL THEN 'Tanque ' || co.tanque ELSE v.load::text END AS load_ou_tanque
FROM t
LEFT JOIN testes pai ON pai.id = t.teste_pai_id
LEFT JOIN vw_compostas v ON v.id = COALESCE(t.composta_id, pai.composta_id)
LEFT JOIN recebimento_lotes rl ON rl.id = t.recebimento_lote_id
LEFT JOIN embarque_amostras ea ON ea.id = t.embarque_amostra_id
LEFT JOIN coletas co ON co.id = t.coleta_id
LEFT JOIN usuarios uf ON uf.id = t.feito_por
LEFT JOIN usuarios ur ON ur.id = t.resultado_por;

COMMIT;
