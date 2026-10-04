-- 009 — C.T e B.L (72h e 120h) por lote (recebimento) e por amostra (embarque)
--
-- Depende da 008 (embarque_amostras) e da 002 (recebimento_lotes). Aplicar com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 009_contagens.sql
--
-- Desenho: docs/concentrado.md, seção 10.2.
--   * prazos: C.T 48h (+2 dias), B.L 72h (+3), B.L 120h (+5), contados da data do
--     recebimento (lote) ou do embarque (amostra)
--   * o resultado é número com sinal opcional: 10, =10, <10, >10
--   * alarme no relatório: B.L >= 50 e C.T >= 200 ('<' nunca alarma)

BEGIN;

CREATE TABLE contagens (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    analise              text NOT NULL CHECK (analise IN ('CT', 'BL72', 'BL120')),
    recebimento_lote_id  bigint REFERENCES recebimento_lotes (id) ON DELETE CASCADE,
    embarque_amostra_id  bigint REFERENCES embarque_amostras (id) ON DELETE CASCADE,
    sinal                text NOT NULL DEFAULT '=' CHECK (sinal IN ('<', '=', '>')),
    valor                numeric NOT NULL CHECK (valor >= 0),
    lido_por             bigint REFERENCES usuarios (id),
    lido_em              timestamptz NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(recebimento_lote_id, embarque_amostra_id) = 1),
    UNIQUE (analise, recebimento_lote_id),
    UNIQUE (analise, embarque_amostra_id)
);

-- Resultado como o analista escreveria ("10", "<10") e o alarme
CREATE OR REPLACE VIEW vw_contagens AS
SELECT c.*,
       (CASE WHEN c.sinal = '=' THEN trim_scale(c.valor)::text
             ELSE c.sinal || trim_scale(c.valor)::text END) AS resultado,
       (CASE WHEN c.sinal = '<' THEN false
             WHEN c.analise = 'CT' THEN c.valor >= 200
             ELSE c.valor >= 50 END) AS alarme
FROM contagens c;

-- O que vence e quando: cada lote/amostra tem as três leituras previstas
CREATE OR REPLACE VIEW vw_contagens_previstas AS
SELECT a.analise,
       'recebimento'::text AS origem,
       rl.id AS recebimento_lote_id,
       NULL::bigint AS embarque_amostra_id,
       rl.load_id,
       rl.lote AS numero,
       (rl.data_recebimento + a.dias) AS prevista
FROM recebimento_lotes rl
CROSS JOIN (VALUES ('CT', 2), ('BL72', 3), ('BL120', 5)) AS a(analise, dias)
UNION ALL
SELECT a.analise,
       'embarque'::text,
       NULL::bigint,
       ea.id,
       ea.load_id,
       ea.numero,
       (ea.data_embarque + a.dias)
FROM embarque_amostras ea
CROSS JOIN (VALUES ('CT', 2), ('BL72', 3), ('BL120', 5)) AS a(analise, dias);

COMMIT;
