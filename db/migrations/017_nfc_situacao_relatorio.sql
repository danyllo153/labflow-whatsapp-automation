-- 017 — situação (ok / não ok) no relatório: NFC placa a placa, desvio de tanque e Howard
--
-- Depende da 003 e da 016. Especificação: docs/specs/nfc-resultados-placas.md (NFC-003 a NFC-006).
--   * vw_relatorio_nfc ganha, no fim, "nao_ok" (alguma leitura da linha acima do limite), "contagem"
--     (as placas da leitura não ok, "30, 12, 8") e "repeticao" (a linha é de uma repetição)
--   * desvios_tanque ganha quem fez a repetição (comando "repetição feita") e fecha sozinho: quando a
--     repetição tem resultado (alguma leitura não ok, ou a leitura final ok), o desvio vira Concluído
--     com o resultado dela (trigger em leituras_placas)
--   * limites_howard: limite máximo do Howard (%), com vigência. Valores reais fora do Git
--     (db/seeds/limites_nfc_exemplo.sql traz um valor fictício)
-- Aplicar: psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 017_nfc_situacao_relatorio.sql

BEGIN;

-- Howard: limite com vigência (acima disso é não ok) ---------------------------------
CREATE TABLE limites_howard (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    limite_max   numeric NOT NULL CHECK (limite_max BETWEEN 0 AND 100),
    vigente_de   date NOT NULL UNIQUE,
    vigente_ate  date,
    CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_de)
);

-- limite em vigor numa data (nulo = sem limite cadastrado)
CREATE OR REPLACE FUNCTION limite_howard(dia date) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT limite_max FROM limites_howard
  WHERE vigente_de <= dia AND (vigente_ate IS NULL OR vigente_ate >= dia)
  ORDER BY vigente_de DESC LIMIT 1
$$;

-- Repetição feita: quem e quando ------------------------------------------------------
ALTER TABLE desvios_tanque ADD COLUMN repeticao_por bigint REFERENCES usuarios (id);
ALTER TABLE desvios_tanque ADD COLUMN repeticao_em  timestamptz;

-- Fecha o desvio de tanque com o resultado da repetição --------------------------------
-- Não ok: alguma leitura da repetição acima do limite (pré-leitura acima do limite já é não ok).
-- Ok: a leitura final da repetição com as 3 placas e nenhuma acima.
CREATE OR REPLACE FUNCTION fechar_desvios_tanque() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE desvios_tanque d
  SET status = 'Concluído',
      resultado = r.resultado,
      resultado_por = (SELECT p.lido_por FROM leituras_placas p WHERE p.analise_id = d.repeticao_id
                       ORDER BY p.lido_em DESC LIMIT 1),
      resultado_em = now()
  FROM (
    SELECT d2.id,
           CASE WHEN bool_or(s.situacao = 'Não ok') THEN 'Não ok' ELSE 'Ok' END AS resultado,
           bool_or(s.situacao = 'Não ok') OR bool_or(s.etapa = 'final' AND s.situacao = 'Ok') AS pronto
    FROM desvios_tanque d2
    JOIN vw_situacao_nfc s ON s.analise_id = d2.repeticao_id
    WHERE d2.status = 'Em repetição'
    GROUP BY d2.id
  ) r
  WHERE d.id = r.id AND r.pronto;
  RETURN NULL;
END $$;

CREATE TRIGGER leituras_placas_fecha_desvio
AFTER INSERT OR UPDATE ON leituras_placas
FOR EACH STATEMENT EXECUTE FUNCTION fechar_desvios_tanque();

-- Relatório do NFC com a situação (colunas novas no fim, para o CREATE OR REPLACE) -------
CREATE OR REPLACE VIEW vw_relatorio_nfc AS
WITH leituras AS (
    SELECT a.pre_leitura_prevista AS dia,
           a.frasco AS amostra,
           CASE a.sub_analise WHEN 'BL' THEN 'B.L 72h' ELSE 'Psicrotróficos 120h' END AS linha,
           a.coleta_id,
           a.status <> 'Aguardando Pré-Leitura' AS lido,
           a.id AS analise_id,
           'pre'::text AS etapa,
           a.repeticao_de IS NOT NULL AS repeticao
    FROM analises a
    WHERE a.pre_leitura_prevista IS NOT NULL
  UNION ALL
    SELECT a.leitura_final_prevista,
           a.frasco,
           CASE a.sub_analise WHEN 'CT' THEN 'C.T 48h' WHEN 'BL' THEN 'B.L 120h' ELSE 'Psicrotróficos 240h' END,
           a.coleta_id,
           a.status = 'Concluído',
           a.id,
           'final'::text,
           a.repeticao_de IS NOT NULL
    FROM analises a
  UNION ALL
    SELECT d.data_prevista, 'Drops', 'Drop ' || d.dia, d.coleta_id, d.status = 'Concluído',
           NULL::bigint, NULL::text, false
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
       bool_and(l.lido) AS lido,
       COALESCE(bool_or(s.situacao = 'Não ok'), false) AS nao_ok,
       string_agg(s.contagem, ' | ') FILTER (WHERE s.situacao = 'Não ok') AS contagem,
       l.repeticao
FROM leituras l
JOIN coletas c ON c.id = l.coleta_id
LEFT JOIN navios n ON n.id = c.navio_id
LEFT JOIN vw_situacao_nfc s ON s.analise_id = l.analise_id AND s.etapa = l.etapa
GROUP BY l.dia, c.origem, l.amostra, l.linha, n.nome, n.viagem, c.tanque, l.repeticao;

COMMIT;
