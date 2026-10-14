-- 027 — recebimento de NFC (suco pronto, item sempre 129)
--
-- Depende da 002 (loads, itens, fabricas) e da 001 (usuarios). As migrations 021 a 026 ficam reservadas
-- para a Fase 1 do LIMS (docs/specs/lims/05-banco-e-migrations.md); esta entra antes e a Fase 1 segue depois.
-- Aplicar com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 027_recebimento_nfc.sql
--
-- Desenho: o laudo "Recebimento NFC" tem load, fábrica, lote, item (129) e, na observação, o tipo da amostra
-- (fresh = fresco, past = pasteurizado) e a diluição analisada ("10 elevado a 3" guarda o 3).
--   * o load reaproveita a tabela loads (item 129), sem misturar com os lotes do concentrado;
--   * a mesma pessoa pode registrar o mesmo lote nos dois tipos (lote 10 past 10^1 e lote 10 fresh 10^3);
--   * repetir lote + tipo corrige a diluição (e a data), como o resultado repetido de C.T e B.L;
--   * C.T, B.L 72h e B.L 120h do NFC seguem os prazos do concentrado (+2, +3 e +5 dias) e o número lido é
--     MULTIPLICADO pela diluição: 14 lido com diluição 10^1 vira 140 (acrescenta um zero por expoente). Guarda-se o
--     valor lido, a diluição usada e o valor final; se a diluição do lote for corrigida, o valor final é recalculado.

BEGIN;

CREATE TABLE recebimento_nfc (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    load_id           bigint NOT NULL REFERENCES loads (id) ON DELETE CASCADE,
    lote              integer NOT NULL CHECK (lote > 0),
    amostra           text NOT NULL CHECK (amostra IN ('fresh', 'past')),
    diluicao          smallint NOT NULL CHECK (diluicao BETWEEN 0 AND 9),   -- expoente: 3 = 10 elevado a 3
    data_recebimento  date NOT NULL,
    registrado_por    bigint REFERENCES usuarios (id),
    registrado_em     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (load_id, lote, amostra)
);

CREATE INDEX recebimento_nfc_por_data ON recebimento_nfc (data_recebimento);

-- Leitura pronta para consulta e painel
CREATE OR REPLACE VIEW vw_recebimento_nfc AS
SELECT r.id,
       l.numero AS "load",
       it.codigo AS item,
       f.nome AS fabrica,
       r.lote,
       r.amostra,
       r.diluicao,
       '10^' || r.diluicao AS diluicao_texto,
       r.data_recebimento,
       u.nome AS registrado_por,
       r.registrado_em
FROM recebimento_nfc r
JOIN loads l ON l.id = r.load_id
JOIN itens it ON it.id = l.item_id
LEFT JOIN fabricas f ON f.id = l.fabrica_id
LEFT JOIN usuarios u ON u.id = r.registrado_por;

-- Resultados de C.T / B.L do NFC recebido (valor final = valor lido x 10^diluicao) ---------------------
CREATE TABLE contagens_nfc (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    analise             text NOT NULL CHECK (analise IN ('CT', 'BL72', 'BL120')),
    recebimento_nfc_id  bigint NOT NULL REFERENCES recebimento_nfc (id) ON DELETE CASCADE,
    sinal               text NOT NULL DEFAULT '=' CHECK (sinal IN ('<', '=', '>')),
    valor               numeric NOT NULL CHECK (valor >= 0),         -- valor final (lido x 10^diluicao)
    valor_lido          numeric NOT NULL CHECK (valor_lido >= 0),    -- como saiu na placa
    diluicao            smallint NOT NULL CHECK (diluicao BETWEEN 0 AND 9),
    lido_por            bigint REFERENCES usuarios (id),
    lido_em             timestamptz NOT NULL DEFAULT now(),
    UNIQUE (analise, recebimento_nfc_id)
);

-- Resultado como o analista escreveria ("140", "<100") e o alarme (mesmos limites do concentrado: B.L >= 50, C.T >= 200)
CREATE OR REPLACE VIEW vw_contagens_nfc AS
SELECT c.*,
       (CASE WHEN c.sinal = '=' THEN trim_scale(c.valor)::text
             ELSE c.sinal || trim_scale(c.valor)::text END) AS resultado,
       (CASE WHEN c.sinal = '<' THEN false
             WHEN c.analise = 'CT' THEN c.valor >= 200
             ELSE c.valor >= 50 END) AS alarme
FROM contagens_nfc c;

-- O que vence e quando: C.T 48h (+2 dias), B.L 72h (+3) e B.L 120h (+5), contados do recebimento
CREATE OR REPLACE VIEW vw_contagens_nfc_previstas AS
SELECT a.analise,
       r.id AS recebimento_nfc_id,
       r.load_id,
       r.lote,
       r.amostra,
       r.diluicao,
       (r.data_recebimento + a.dias) AS prevista
FROM recebimento_nfc r
CROSS JOIN (VALUES ('CT', 2), ('BL72', 3), ('BL120', 5)) AS a(analise, dias);

COMMIT;
