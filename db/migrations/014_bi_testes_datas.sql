-- 014 — bi.testes com as datas de cada etapa (para o Power BI)
--
-- Depende da 013. Só acrescenta colunas no FIM da view bi.testes (nenhuma tabela muda):
--   espalhar_prevista    TAB: espalhar · Coliformes: estriar
--   leitura_prevista     último dia da incubação (TAB: feito + 10; Coliformes: estria + 1)
--   confirmacao_prevista só quando está em confirmação: TAB lê no dia seguinte (PCA 24h);
--                        Coliformes: dia da leitura dos lotes da composta aberta
-- O TAB incubado é lido todo dia: se cresce antes, entra em confirmação antes da leitura
-- prevista, por isso as duas datas aparecem separadas no painel.
-- Aplicar: psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 014_bi_testes_datas.sql

BEGIN;

CREATE OR REPLACE VIEW bi.testes AS
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
            WHEN t.proxima_etapa = CURRENT_DATE THEN 'Vence hoje' ELSE 'No prazo' END AS situacao,
       -- novas (014)
       t.espalhar_prevista,
       t.leitura_prevista,
       CASE WHEN t.status = 'Em confirmação' THEN t.confirmacao_prevista END AS confirmacao_prevista
FROM t
LEFT JOIN testes pai ON pai.id = t.teste_pai_id
LEFT JOIN vw_compostas v ON v.id = COALESCE(t.composta_id, pai.composta_id)
LEFT JOIN coletas co ON co.id = t.coleta_id
LEFT JOIN usuarios uf ON uf.id = t.feito_por
LEFT JOIN usuarios ur ON ur.id = t.resultado_por;

COMMIT;
