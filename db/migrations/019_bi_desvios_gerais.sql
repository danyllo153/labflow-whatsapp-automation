-- 019 — painel: a view bi.desvios junta os desvios de drop e os desvios de tanque
--
-- Depende da 013, 016 e 017. As colunas antigas continuam (o desvio de tanque deixa "drop" e as
-- temperaturas vazios) e entram, no fim:
--   tipo ("Drop" ou "Tanque"), analise (D5, D10, D15, C.T 48h, B.L 72h, B.L 120h, WORT ...),
--   analise_ordem (para o filtro sair na ordem), frasco e contagem (as placas que deram não ok)
-- Desvio de tanque: status "Em repetição" ou "Concluído"; resultado "Em repetição", "Repetição ok" ou
-- "Repetição não ok"; prazo = leitura final da repetição. desvio_id do tanque = id + 1.000.000 (não repete o do drop).
-- Aplicar: psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 019_bi_desvios_gerais.sql

BEGIN;

CREATE OR REPLACE VIEW bi.desvios AS
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
            WHEN v.leitura_prevista = CURRENT_DATE THEN 'Vence hoje' ELSE 'No prazo' END AS situacao,
       'Drop'::text AS tipo,
       'D' || v.dia AS analise,
       v.dia::int AS analise_ordem,
       NULL::text AS frasco,
       NULL::text AS contagem
FROM vw_desvios_drop v
UNION ALL
SELECT t.id + 1000000,
       CASE t.origem WHEN 'terra' THEN 'Terra' ELSE 'Navio' END,
       t.tanque,
       t.navio,
       t.data_coleta,
       NULL::text,
       t.data_abertura,
       t.repeticao_prevista,
       t.status,
       CASE WHEN t.status = 'Em repetição' THEN 'Em repetição'
            WHEN t.resultado = 'Ok' THEN 'Repetição ok' ELSE 'Repetição não ok' END,
       NULL::text,
       false, false, false,
       t.aberto_por,
       t.resultado_por,
       (t.resultado_em AT TIME ZONE 'America/Sao_Paulo')::date,
       CASE WHEN t.status = 'Concluído' THEN 'Concluído' WHEN t.repeticao_prevista < CURRENT_DATE THEN 'Atrasado'
            WHEN t.repeticao_prevista = CURRENT_DATE THEN 'Vence hoje' ELSE 'No prazo' END,
       'Tanque',
       CASE t.sub_analise WHEN 'CT' THEN 'C.T 48h'
                          WHEN 'BL' THEN CASE t.etapa WHEN 'pre' THEN 'B.L 72h' ELSE 'B.L 120h' END
                          ELSE 'WORT ' || CASE t.metodo WHEN 'Superficie' THEN 'Superfície' ELSE 'Profundidade' END
                               || CASE t.etapa WHEN 'pre' THEN ' 120h' ELSE ' 240h' END END,
       CASE t.sub_analise WHEN 'CT' THEN 20 WHEN 'BL' THEN CASE t.etapa WHEN 'pre' THEN 21 ELSE 22 END
                          ELSE CASE t.metodo WHEN 'Superficie' THEN 25 ELSE 23 END + CASE t.etapa WHEN 'pre' THEN 0 ELSE 1 END END,
       t.frasco,
       t.contagem_original
FROM vw_desvios_tanque t;

COMMIT;
