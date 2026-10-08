-- 016 — resultados de NFC placa a placa, limites e desvio de tanque
--
-- Depende da 001 e da 012. Especificação: docs/specs/nfc-resultados-placas.md.
--   * leituras_placas: o número de cada placa (triplicata) de cada leitura de C.T, B.L e WORT.
--     "<1" = sinal '<' e valor 1 (placa sem colônia, digitada como 0 ou preenchida pela
--     "leitura do dia finalizada", origem 'automatico')
--   * limites_nfc: limite máximo por placa, por análise, método e etapa, com vigência.
--     Os valores reais são confidenciais: ficam num arquivo FORA do Git (ver
--     db/seeds/limites_nfc_exemplo.sql, que só traz valores fictícios)
--   * analises.repeticao_de: a repetição é uma análise nova (frasco de arquivo, mesmos prazos,
--     contados da abertura do desvio) que aponta para a análise que deu não ok
--   * desvios_tanque: aberto com "sim" quando uma leitura dá não ok (C.T, B.L ou WORT);
--     fecha com o resultado da repetição (a nova contagem vale)
--   * vw_situacao_nfc: ok / não ok / pendente de cada leitura, com a contagem ("30, 12, 8")
-- Aplicar: psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 016_nfc_placas.sql

BEGIN;

-- Limites (valores reais fora do Git) -------------------------------------------
CREATE TABLE limites_nfc (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sub_analise   text NOT NULL CHECK (sub_analise IN ('CT', 'BL', 'WORT')),
    metodo        text NOT NULL CHECK (metodo IN ('Profundidade', 'Superficie')),
    etapa         text NOT NULL CHECK (etapa IN ('pre', 'final')),
    limite_max    numeric NOT NULL CHECK (limite_max >= 0),   -- por placa; acima disso é não ok
    vigente_de    date NOT NULL,
    vigente_ate   date,                                       -- nulo = em vigor
    CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_de),
    CHECK (etapa = 'final' OR sub_analise <> 'CT'),           -- C.T não tem pré-leitura
    CHECK (metodo = 'Profundidade' OR sub_analise = 'WORT'),
    UNIQUE (sub_analise, metodo, etapa, vigente_de)
);

-- Repetição: análise nova que aponta para a que deu não ok ------------------------
ALTER TABLE analises ADD COLUMN repeticao_de bigint REFERENCES analises (id) ON DELETE CASCADE;
CREATE INDEX analises_repeticoes ON analises (repeticao_de) WHERE repeticao_de IS NOT NULL;

-- Placas (triplicata) ------------------------------------------------------------
CREATE TABLE leituras_placas (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    analise_id  bigint NOT NULL REFERENCES analises (id) ON DELETE CASCADE,
    etapa       text NOT NULL CHECK (etapa IN ('pre', 'final')),
    placa       smallint NOT NULL CHECK (placa BETWEEN 1 AND 3),
    sinal       text NOT NULL DEFAULT '=' CHECK (sinal IN ('<', '=', '>')),
    valor       numeric NOT NULL CHECK (valor >= 0),
    origem      text NOT NULL DEFAULT 'digitado' CHECK (origem IN ('digitado', 'automatico')),
    lido_por    bigint REFERENCES usuarios (id),
    lido_em     timestamptz NOT NULL DEFAULT now(),
    CHECK (sinal <> '<' OR valor = 1),                        -- "<" só existe como "<1"
    CHECK (origem = 'digitado' OR (sinal = '<' AND valor = 1)),
    UNIQUE (analise_id, etapa, placa)
);

-- Desvio de tanque -----------------------------------------------------------------
CREATE TABLE desvios_tanque (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    analise_id     bigint NOT NULL UNIQUE REFERENCES analises (id) ON DELETE CASCADE,  -- a que deu não ok
    etapa          text NOT NULL CHECK (etapa IN ('pre', 'final')),                    -- leitura que deu não ok
    repeticao_id   bigint UNIQUE REFERENCES analises (id) ON DELETE SET NULL,          -- análise refeita
    data_abertura  date NOT NULL,
    aberto_por     bigint REFERENCES usuarios (id),
    aberto_em      timestamptz NOT NULL DEFAULT now(),
    status         text NOT NULL DEFAULT 'Em repetição' CHECK (status IN ('Em repetição', 'Concluído')),
    resultado      text CHECK (resultado IN ('Ok', 'Não ok')),                         -- da repetição
    resultado_por  bigint REFERENCES usuarios (id),
    resultado_em   timestamptz,
    CHECK ((status = 'Concluído') = (resultado IS NOT NULL)),
    CHECK (repeticao_id IS NULL OR repeticao_id <> analise_id)
);

CREATE INDEX desvios_tanque_abertos ON desvios_tanque (data_abertura) WHERE status = 'Em repetição';

-- Situação de cada leitura ----------------------------------------------------------
-- Uma linha por análise e etapa (C.T só 'final'). Não ok: alguma placa acima do limite
-- (pré-leitura acima do limite já é não ok). Ok: as 3 placas lidas e nenhuma acima.
-- Pendente: faltam placas. Sem limite em vigor: 'Sem limite'.
CREATE OR REPLACE VIEW vw_situacao_nfc AS
WITH leituras AS (
  SELECT a.id AS analise_id, e.etapa,
         CASE e.etapa WHEN 'pre' THEN a.pre_leitura_prevista ELSE a.leitura_final_prevista END AS leitura_prevista
  FROM analises a
  CROSS JOIN (VALUES ('pre'), ('final')) e (etapa)
  WHERE e.etapa = 'final' OR a.sub_analise <> 'CT'
)
SELECT l.analise_id,
       a.coleta_id,
       c.origem,
       c.tanque,
       trim(n.nome || ' ' || n.viagem) AS navio,
       c.data_coleta,
       a.frasco,
       a.sub_analise,
       a.metodo,
       l.etapa,
       a.data_analise,
       l.leitura_prevista,
       a.repeticao_de,
       p.placas_lidas,
       p.contagem,
       p.maior,
       lim.limite_max,
       CASE WHEN p.acima > 0 THEN 'Não ok'
            WHEN lim.limite_max IS NULL AND p.placas_lidas > 0 THEN 'Sem limite'
            WHEN p.placas_lidas = 3 THEN 'Ok'
            ELSE 'Pendente' END AS situacao,
       d.id AS desvio_id,
       d.status AS desvio_status
FROM leituras l
JOIN analises a ON a.id = l.analise_id
JOIN coletas c ON c.id = a.coleta_id
LEFT JOIN navios n ON n.id = c.navio_id
LEFT JOIN LATERAL (
  SELECT x.limite_max
  FROM limites_nfc x
  WHERE x.sub_analise = a.sub_analise AND x.metodo = a.metodo AND x.etapa = l.etapa
    AND x.vigente_de <= a.data_analise AND (x.vigente_ate IS NULL OR x.vigente_ate >= a.data_analise)
  ORDER BY x.vigente_de DESC
  LIMIT 1
) lim ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS placas_lidas,
         string_agg(CASE WHEN pl.sinal = '=' THEN trim_scale(pl.valor)::text
                         ELSE pl.sinal || trim_scale(pl.valor)::text END, ', ' ORDER BY pl.placa) AS contagem,
         max(pl.valor) FILTER (WHERE pl.sinal <> '<') AS maior,
         count(*) FILTER (WHERE pl.sinal = '>' OR (pl.sinal = '=' AND pl.valor > lim.limite_max))::int AS acima
  FROM leituras_placas pl
  WHERE pl.analise_id = l.analise_id AND pl.etapa = l.etapa
) p ON true
LEFT JOIN desvios_tanque d ON d.analise_id = l.analise_id AND d.etapa = l.etapa;

-- desvio de tanque com tudo o que a consulta, o relatório e o painel precisam
CREATE OR REPLACE VIEW vw_desvios_tanque AS
SELECT x.id,
       x.analise_id,
       c.origem,
       c.tanque,
       trim(n.nome || ' ' || n.viagem) AS navio,
       c.data_coleta,
       a.frasco,
       a.sub_analise,
       a.metodo,
       x.etapa,
       s.contagem AS contagem_original,
       x.repeticao_id,
       r.data_analise AS repeticao_data,
       r.leitura_final_prevista AS repeticao_prevista,
       x.data_abertura,
       x.status,
       x.resultado,
       ua.nome AS aberto_por,
       x.aberto_em,
       ur.nome AS resultado_por,
       x.resultado_em
FROM desvios_tanque x
JOIN analises a ON a.id = x.analise_id
JOIN coletas c ON c.id = a.coleta_id
LEFT JOIN navios n ON n.id = c.navio_id
LEFT JOIN analises r ON r.id = x.repeticao_id
LEFT JOIN vw_situacao_nfc s ON s.analise_id = x.analise_id AND s.etapa = x.etapa
LEFT JOIN usuarios ua ON ua.id = x.aberto_por
LEFT JOIN usuarios ur ON ur.id = x.resultado_por;

-- pendência do "sim/não" para gravar as placas e abrir o desvio de tanque
ALTER TABLE confirmacoes DROP CONSTRAINT confirmacoes_tipo_check;
ALTER TABLE confirmacoes ADD CONSTRAINT confirmacoes_tipo_check
  CHECK (tipo IN ('LEITURA', 'IA', 'TAB', 'DIA', 'DESVIO', 'PLACAS', 'DESVIO_TANQUE'));

COMMIT;
