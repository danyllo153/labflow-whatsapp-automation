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
--   * repetir lote + tipo corrige a diluição (e a data), como o resultado repetido de C.T e B.L.

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

COMMIT;
