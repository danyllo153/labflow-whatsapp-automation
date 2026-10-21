-- 030 — hora de cada leitura (pedido PB1 da sessão do app)
--
-- Depende da 001 (analises) e da 018 (bi.leituras_nfc). Aplicar com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 030_hora_leituras.sql
--
-- O relatório do turno do app precisa saber QUANDO cada leitura foi feita. Até agora analises guardava só quem
-- (pre_leitura_por, leitura_final_por). Colunas novas, preenchidas por um gatilho no próprio banco: assim valem para
-- o bot (4 nós do n8n gravam leitura), para o app e para qualquer escrita futura, sem mexer no workflow.
--   * pre_leitura_em: quando a análise foi para "Aguardando Leitura Final" (ou quando mudou quem fez a pré-leitura);
--   * leitura_final_em: quando a análise foi para "Concluído" (ou quando mudou quem fez a leitura final).
-- Leituras antigas ficam com a hora vazia (a hora real não existe; nada é inventado).
-- Outras tabelas com "quem" sem "quando": nenhuma (testes.feito_por tem criado_em; as demais já têm o _em).

BEGIN;

ALTER TABLE analises ADD COLUMN IF NOT EXISTS pre_leitura_em timestamptz;
ALTER TABLE analises ADD COLUMN IF NOT EXISTS leitura_final_em timestamptz;

CREATE OR REPLACE FUNCTION analises_hora_leitura() RETURNS trigger AS $$
BEGIN
    IF (NEW.status = 'Aguardando Leitura Final' AND NEW.status IS DISTINCT FROM OLD.status)
       OR (NEW.pre_leitura_por IS NOT NULL AND NEW.pre_leitura_por IS DISTINCT FROM OLD.pre_leitura_por) THEN
        NEW.pre_leitura_em := now();
    END IF;
    IF (NEW.status = 'Concluído' AND NEW.status IS DISTINCT FROM OLD.status)
       OR (NEW.leitura_final_por IS NOT NULL AND NEW.leitura_final_por IS DISTINCT FROM OLD.leitura_final_por) THEN
        NEW.leitura_final_em := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS analises_hora_leitura ON analises;
CREATE TRIGGER analises_hora_leitura BEFORE UPDATE ON analises
    FOR EACH ROW EXECUTE FUNCTION analises_hora_leitura();

-- Painel e app: bi.leituras_nfc ganha lida_em (hora da pré-leitura ou da leitura final daquela linha), no fim da lista
CREATE OR REPLACE VIEW bi.leituras_nfc AS
WITH l AS (
  SELECT a.id, a.coleta_id, a.frasco, a.sub_analise, a.metodo, a.data_analise, a.pre_leitura_prevista, a.leitura_final_prevista,
         a.status, a.registrado_por, a.pre_leitura_por, a.leitura_final_por, a.registrado_em, a.repeticao_de,
         'Pré-leitura'::text AS etapa, a.pre_leitura_prevista AS prevista,
         a.status <> 'Aguardando Pré-Leitura'::text AS lida, a.pre_leitura_por AS lida_por_id,
         CASE a.sub_analise WHEN 'BL'::text THEN 'B.L 72h'::text ELSE 'Psicrotróficos 120h'::text END AS linha_relatorio,
         'pre'::text AS etapa_placas, a.pre_leitura_em AS lida_em
  FROM analises a
  WHERE a.pre_leitura_prevista IS NOT NULL
  UNION ALL
  SELECT a.id, a.coleta_id, a.frasco, a.sub_analise, a.metodo, a.data_analise, a.pre_leitura_prevista, a.leitura_final_prevista,
         a.status, a.registrado_por, a.pre_leitura_por, a.leitura_final_por, a.registrado_em, a.repeticao_de,
         'Leitura final'::text, a.leitura_final_prevista, a.status = 'Concluído'::text, a.leitura_final_por,
         CASE a.sub_analise WHEN 'CT'::text THEN 'C.T 48h'::text WHEN 'BL'::text THEN 'B.L 120h'::text ELSE 'Psicrotróficos 240h'::text END,
         'final'::text, a.leitura_final_em
  FROM analises a
)
SELECT l.id AS analise_id,
       l.coleta_id,
       CASE c.origem WHEN 'terra'::text THEN 'Terra'::text ELSE 'Navio'::text END AS origem,
       c.tanque,
       TRIM(BOTH FROM (n.nome || ' '::text) || n.viagem) AS navio,
       c.data_coleta,
       l.frasco,
       CASE l.sub_analise WHEN 'CT'::text THEN 'C.T'::text WHEN 'BL'::text THEN 'B.L'::text ELSE 'Psicrotróficos'::text END AS analise,
       l.metodo,
       l.etapa,
       l.linha_relatorio,
       l.data_analise,
       l.prevista,
       l.lida,
       u.nome AS lida_por,
       CASE WHEN l.lida THEN 'Lido'::text
            WHEN l.prevista < CURRENT_DATE THEN 'Atrasado'::text
            WHEN l.prevista = CURRENT_DATE THEN 'Vence hoje'::text
            ELSE 'No prazo'::text END AS situacao,
       pl.placa_1,
       pl.placa_2,
       pl.placa_3,
       s.contagem,
       s.maior,
       CASE WHEN s.situacao = ANY (ARRAY['Ok'::text, 'Não ok'::text, 'Sem limite'::text]) THEN s.situacao
            WHEN l.lida AND COALESCE(s.placas_lidas, 0) = 0 THEN 'Sem placas'::text
            ELSE 'Pendente'::text END AS resultado,
       l.repeticao_de IS NOT NULL AS repeticao,
       CASE WHEN dt.id IS NULL THEN NULL::text
            WHEN dt.status = 'Em repetição'::text THEN 'Em repetição'::text
            WHEN dt.resultado = 'Ok'::text THEN 'Repetição ok'::text
            ELSE 'Repetição não ok'::text END AS desvio,
       l.lida_em
FROM l
JOIN coletas c ON c.id = l.coleta_id
LEFT JOIN navios n ON n.id = c.navio_id
LEFT JOIN usuarios u ON u.id = l.lida_por_id
LEFT JOIN vw_situacao_nfc s ON s.analise_id = l.id AND s.etapa = l.etapa_placas
LEFT JOIN desvios_tanque dt ON dt.analise_id = l.id AND dt.etapa = l.etapa_placas
LEFT JOIN LATERAL (
  SELECT max(CASE WHEN p.placa = 1 THEN CASE p.sinal WHEN '<'::text THEN 0::numeric ELSE p.valor END ELSE NULL::numeric END) AS placa_1,
         max(CASE WHEN p.placa = 2 THEN CASE p.sinal WHEN '<'::text THEN 0::numeric ELSE p.valor END ELSE NULL::numeric END) AS placa_2,
         max(CASE WHEN p.placa = 3 THEN CASE p.sinal WHEN '<'::text THEN 0::numeric ELSE p.valor END ELSE NULL::numeric END) AS placa_3
  FROM leituras_placas p
  WHERE p.analise_id = l.id AND p.etapa = l.etapa_placas
) pl ON true;

COMMIT;