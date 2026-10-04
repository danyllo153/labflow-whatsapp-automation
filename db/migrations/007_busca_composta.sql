-- 007 — achar a composta pelos lotes (para quem escreve o comando completo)
--
-- Depende da 004 (vw_compostas). Só leitura.
--   composta_por_lotes('77001', '444', ARRAY[1,2,3,4,5]) -> id da composta com exatamente esses lotes
--   composta_do_lote('77001', '', 7)                     -> id da composta que contém o lote 7
-- Item vazio = qualquer item daquele load.

BEGIN;

CREATE OR REPLACE FUNCTION composta_por_lotes(p_load text, p_item text, p_lotes int[])
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT v.id
    FROM vw_compostas v
    WHERE v.load = p_load
      AND (NULLIF(p_item, '') IS NULL OR v.item = p_item)
      AND v.lotes = (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_lotes) AS x)
    ORDER BY v.id
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION composta_do_lote(p_load text, p_item text, p_lote int)
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT v.id
    FROM vw_compostas v
    WHERE v.load = p_load
      AND (NULLIF(p_item, '') IS NULL OR v.item = p_item)
      AND p_lote = ANY (v.lotes)
    ORDER BY v.id
    LIMIT 1
$$;

COMMIT;
