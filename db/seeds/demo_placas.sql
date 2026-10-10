-- Placas de NFC de DEMONSTRAÇÃO (fictícias), para o relatório e o painel: a triplicata de cada leitura já
-- feita dos tanques demo (terra 80 a 95 e navio DEMO STAR 900), com alguns resultados não ok pelos
-- limites de exemplo, e até 4 desvios de tanque com a repetição (os antigos já fechados pelo resultado).
-- Depende das migrations 016 e 017, de db/seeds/limites_nfc_exemplo.sql e de db/seeds/demo.sql.
-- Pode rodar de novo (não duplica). O limpar_demo.sql apaga junto (as placas e desvios caem com as análises).
-- Aplicar: psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f db/seeds/demo_placas.sql

BEGIN;

CREATE TEMP TABLE demo_a ON COMMIT DROP AS
SELECT a.id, a.sub_analise, e.etapa, e.prevista, e.lido_por
FROM analises a
JOIN coletas c ON c.id = a.coleta_id
LEFT JOIN navios n ON n.id = c.navio_id
CROSS JOIN LATERAL (VALUES
  ('pre',   a.pre_leitura_prevista,   a.pre_leitura_por,   a.pre_leitura_prevista IS NOT NULL AND a.status <> 'Aguardando Pré-Leitura'),
  ('final', a.leitura_final_prevista, a.leitura_final_por, a.status = 'Concluído')) e (etapa, prevista, lido_por, lida)
WHERE e.lida AND a.repeticao_de IS NULL
  AND ((c.origem = 'terra' AND c.tanque ~ '^(8[0-9]|9[0-5])$') OR trim(n.nome || ' ' || n.viagem) = 'DEMO STAR 900');

-- C.T: 0 a 30 colônias por placa (de vez em quando uma placa acima do limite);
-- B.L e WORT: quase sempre sem colônia, às vezes 1 ou 2, raramente mais
INSERT INTO leituras_placas (analise_id, etapa, placa, sinal, valor, origem, lido_por, lido_em)
SELECT d.id, d.etapa, g.p,
       CASE WHEN v.x = 0 THEN '<' ELSE '=' END, CASE WHEN v.x = 0 THEN 1 ELSE v.x END,
       'digitado', d.lido_por, (d.prevista + time '10:00')::timestamptz
FROM demo_a d
CROSS JOIN generate_series(1, 3) g (p)
CROSS JOIN LATERAL (SELECT CASE
  WHEN d.sub_analise = 'CT' THEN CASE WHEN d.id % 19 = 0 AND g.p = 1 THEN 46 ELSE (d.id * 37 + g.p * 11) % 31 END
  WHEN (d.id * 17 + g.p * 5) % 20 < 16 THEN 0
  WHEN (d.id * 17 + g.p * 5) % 20 < 19 THEN 1 + (d.id + g.p) % 2
  WHEN d.id % 7 = 0 THEN 5
  ELSE 2 END AS x) v
ON CONFLICT (analise_id, etapa, placa) DO NOTHING;

-- Desvios de tanque: as 4 leituras não ok mais recentes ganham desvio e repetição (frasco de arquivo, prazos
-- contados da leitura). Repetição com leitura já vencida recebe placas (a 2ª dá não ok de novo) e o desvio
-- fecha sozinho pelo trigger; a mais recente fica "Em repetição".
DO $$
DECLARE
  r record;
  rid bigint;
  k int := 0;
  fim date;
BEGIN
  FOR r IN
    SELECT * FROM (
      -- uma vez por análise: a primeira leitura não ok (a pré-leitura, quando as duas deram não ok)
      SELECT DISTINCT ON (s.analise_id) s.analise_id, s.etapa, s.leitura_prevista, a.coleta_id, a.frasco,
             a.sub_analise, a.metodo, a.registrado_por
      FROM vw_situacao_nfc s
      JOIN analises a ON a.id = s.analise_id
      JOIN demo_a d ON d.id = a.id AND d.etapa = s.etapa
      WHERE s.situacao = 'Não ok'
        AND NOT EXISTS (SELECT 1 FROM desvios_tanque x WHERE x.analise_id = s.analise_id)
      ORDER BY s.analise_id, s.leitura_prevista
    ) u
    ORDER BY u.leitura_prevista DESC
    LIMIT 4
  LOOP
    k := k + 1;
    fim := r.leitura_prevista + CASE r.sub_analise WHEN 'CT' THEN 2 WHEN 'BL' THEN 5 ELSE 10 END;
    INSERT INTO analises (coleta_id, frasco, sub_analise, metodo, data_analise, pre_leitura_prevista,
                          leitura_final_prevista, status, registrado_por, pre_leitura_por, leitura_final_por, repeticao_de)
    VALUES (r.coleta_id, r.frasco, r.sub_analise, r.metodo, r.leitura_prevista,
            CASE r.sub_analise WHEN 'CT' THEN NULL WHEN 'BL' THEN r.leitura_prevista + 3 ELSE r.leitura_prevista + 5 END,
            fim,
            CASE WHEN fim < CURRENT_DATE THEN 'Concluído'
                 WHEN r.sub_analise = 'CT' THEN 'Aguardando Leitura Final' ELSE 'Aguardando Pré-Leitura' END,
            r.registrado_por,
            CASE WHEN fim < CURRENT_DATE AND r.sub_analise <> 'CT' THEN r.registrado_por END,
            CASE WHEN fim < CURRENT_DATE THEN r.registrado_por END,
            r.analise_id)
    RETURNING id INTO rid;
    INSERT INTO desvios_tanque (analise_id, etapa, repeticao_id, data_abertura, aberto_por, aberto_em, repeticao_por, repeticao_em)
    VALUES (r.analise_id, r.etapa, rid, r.leitura_prevista, r.registrado_por, (r.leitura_prevista + time '11:00')::timestamptz,
            r.registrado_por, (r.leitura_prevista + time '11:30')::timestamptz);
    IF fim < CURRENT_DATE THEN
      INSERT INTO leituras_placas (analise_id, etapa, placa, sinal, valor, origem, lido_por, lido_em)
      SELECT rid, e.etapa, g.p,
             CASE WHEN k = 2 AND g.p = 1 THEN '=' ELSE '<' END,
             CASE WHEN k = 2 AND g.p = 1 THEN CASE r.sub_analise WHEN 'CT' THEN 52 ELSE 6 END ELSE 1 END,
             'digitado', r.registrado_por, (fim + time '10:00')::timestamptz
      FROM (VALUES ('pre'), ('final')) e (etapa)
      CROSS JOIN generate_series(1, 3) g (p)
      WHERE e.etapa = 'final' OR r.sub_analise <> 'CT';
    END IF;
  END LOOP;
END $$;

COMMIT;
