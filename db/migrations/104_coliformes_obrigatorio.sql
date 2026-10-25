-- 104 — Coliformes obrigatório nas compostas (regra do Danyllo de 25/10/2026)
--
-- Regra do laboratório: no EMBARQUE, toda composta faz Coliformes. No RECEBIMENTO, só uma composta de cada load (a primeira,
-- ex.: lotes 1-5 de um load novo); feito o Coliformes de uma composta do load, as outras não pedem mais. A fábrica COL (Colina)
-- é exceção: toda composta do load faz Coliformes. O que já está no banco NÃO vira obrigatório (a coluna nasce false e só a
-- composta criada daqui em diante é marcada).
-- Depende da 043 (criar_compostas), da 103 (vw_coliformes_pendentes) e da vw_compostas. Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 104_coliformes_obrigatorio.sql
-- Desfazer: 104_coliformes_obrigatorio_desfazer.sql.
--
--   compostas.coliformes_obrigatorio: marcada por gatilho na criação (embarque; fábrica COL; primeira composta do load).
--   criar_compostas: igual à da 043, devolvendo também coliformes_obrigatorio (ids), coliformes_motivo ('primeira'|'col') e
--     o aviso no fim do texto (o bot mostra na resposta das compostas).
--   vw_coliformes_pendentes: ganha no fim obrigatorio (boolean) e motivo; numa composta de recebimento que não é da COL, o
--     obrigatório some quando qualquer composta do mesmo load já tem Coliformes.

BEGIN;

ALTER TABLE compostas ADD COLUMN coliformes_obrigatorio boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION compostas_marcar_coliformes() RETURNS trigger AS $$
BEGIN
    IF NEW.embarque_id IS NOT NULL THEN
        NEW.coliformes_obrigatorio := true;
    ELSE
        NEW.coliformes_obrigatorio :=
            COALESCE((SELECT fb.nome = 'COL' FROM loads l JOIN fabricas fb ON fb.id = l.fabrica_id WHERE l.id = NEW.load_id), false)
            OR NOT EXISTS (SELECT 1 FROM compostas c WHERE c.load_id = NEW.load_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER compostas_coliformes_obrigatorio BEFORE INSERT ON compostas
    FOR EACH ROW EXECUTE FUNCTION compostas_marcar_coliformes();

-- igual à da 043, com o aviso do Coliformes obrigatório
CREATE OR REPLACE FUNCTION criar_compostas(p_quem bigint, p_load text, p_item text, p_grupos jsonb, p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_load   text := trim(COALESCE(p_load, ''));
    v_item   text := NULLIF(trim(COALESCE(p_item, '')), '');
    v_n      int;
    v_ld     bigint;
    v_erros  text;
    v_ids    bigint[] := '{}';
    v_cid    bigint;
    g        record;
    v_linhas text[] := '{}';
    v_ob     bigint[] := '{}';
    v_obp    text[] := '{}';
    v_col    boolean;
    v_prim   boolean;
    v_aviso  text := '';
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF p_grupos IS NULL OR jsonb_typeof(p_grupos) <> 'array' OR jsonb_array_length(p_grupos) = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_grupos) x WHERE jsonb_typeof(x) <> 'array' OR jsonb_array_length(x) = 0) THEN
        RAISE EXCEPTION 'Diga os lotes de cada composta, ex.: (1-5)(6-10).';
    END IF;
    SELECT count(*), min(l.id) INTO v_n, v_ld FROM loads l JOIN itens it ON it.id = l.item_id
    WHERE l.numero = v_load AND (v_item IS NULL OR it.codigo = v_item);
    IF v_n = 0 THEN
        RAISE EXCEPTION 'Load % não encontrado. Registre o recebimento primeiro.', v_load || COALESCE(' item ' || v_item, '');
    END IF;
    IF v_n > 1 THEN
        RAISE EXCEPTION 'Existe mais de um load %. Informe o item: compostas do load % item 444 (1-5)(6-10)', v_load, v_load;
    END IF;
    WITH pedidos AS (
        SELECT x::int AS lote, gg.ord FROM jsonb_array_elements(p_grupos) WITH ORDINALITY AS gg(val, ord), jsonb_array_elements_text(gg.val) x
    ), lotes AS (
        SELECT p.lote, rl.id AS rl_id, (SELECT cl.composta_id FROM composta_lotes cl WHERE cl.recebimento_lote_id = rl.id) AS ja_em,
               count(*) OVER (PARTITION BY p.lote) AS vezes
        FROM pedidos p LEFT JOIN recebimento_lotes rl ON rl.load_id = v_ld AND rl.lote = p.lote
    )
    SELECT string_agg(DISTINCT CASE WHEN rl_id IS NULL THEN 'lote ' || lote || ' não foi recebido'
                                    WHEN ja_em IS NOT NULL THEN 'lote ' || lote || ' já está na composta #' || ja_em
                                    ELSE 'lote ' || lote || ' aparece em duas compostas' END, '; ')
    INTO v_erros FROM lotes WHERE rl_id IS NULL OR ja_em IS NOT NULL OR vezes > 1;
    IF v_erros IS NOT NULL THEN
        RAISE EXCEPTION 'Nenhuma composta criada: %.', v_erros;
    END IF;

    -- Coliformes obrigatório (104): a primeira composta do load, ou toda composta da fábrica COL
    SELECT COALESCE(fb.nome = 'COL', false) INTO v_col FROM loads l LEFT JOIN fabricas fb ON fb.id = l.fabrica_id WHERE l.id = v_ld;
    v_prim := NOT EXISTS (SELECT 1 FROM compostas c WHERE c.load_id = v_ld);

    FOR g IN SELECT val, ord FROM jsonb_array_elements(p_grupos) WITH ORDINALITY AS t(val, ord) ORDER BY ord LOOP
        v_linhas := v_linhas || ('lotes ' || lista_compacta(ARRAY(SELECT x::int FROM jsonb_array_elements_text(g.val) x)));
        IF NOT p_previa THEN
            INSERT INTO compostas (load_id, criada_por) VALUES (v_ld, p_quem) RETURNING id INTO v_cid;
            INSERT INTO composta_lotes (composta_id, recebimento_lote_id)
            SELECT v_cid, rl.id FROM recebimento_lotes rl
            WHERE rl.load_id = v_ld AND rl.lote IN (SELECT x::int FROM jsonb_array_elements_text(g.val) x);
            v_ids := v_ids || v_cid;
            IF (SELECT c.coliformes_obrigatorio FROM compostas c WHERE c.id = v_cid) THEN
                v_ob := v_ob || v_cid;
            END IF;
            v_linhas[cardinality(v_linhas)] := '#' || v_cid || ' ' || v_linhas[cardinality(v_linhas)];
        ELSIF v_col OR (v_prim AND g.ord = 1) THEN
            v_obp := v_obp || v_linhas[cardinality(v_linhas)];
        END IF;
    END LOOP;
    IF cardinality(v_ob) > 0 THEN
        v_aviso := ' Coliformes obrigatório: ' || array_to_string(ARRAY(SELECT '#' || x FROM unnest(v_ob) x), ', ')
                   || CASE WHEN v_col THEN ' (fábrica COL: toda composta do load).' ELSE ' (primeira composta do load).' END;
    ELSIF cardinality(v_obp) > 0 THEN
        v_aviso := ' Coliformes obrigatório: ' || array_to_string(v_obp, ', ')
                   || CASE WHEN v_col THEN ' (fábrica COL: toda composta do load).' ELSE ' (primeira composta do load).' END;
    END IF;
    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'ids', to_jsonb(v_ids), 'criadas', cardinality(v_ids),
        'coliformes_obrigatorio', to_jsonb(v_ob), 'coliformes_motivo', CASE WHEN v_aviso = '' THEN NULL WHEN v_col THEN 'col' ELSE 'primeira' END,
        'texto', jsonb_array_length(p_grupos) || ' composta' || CASE WHEN jsonb_array_length(p_grupos) > 1 THEN 's' ELSE '' END
                 || ' no load ' || v_load || ': ' || array_to_string(v_linhas, '; ') || '.' || v_aviso);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Coliformes pendente (103) com o obrigatório e o motivo no fim.
CREATE OR REPLACE VIEW vw_coliformes_pendentes AS
SELECT v.id AS composta_id, v.origem, v.rotulo, v.load, v.item, v.lotes, c.criada_em,
       o.obrigatorio,
       CASE WHEN NOT o.obrigatorio THEN NULL
            WHEN c.embarque_id IS NOT NULL THEN 'embarque: toda composta'
            WHEN v.fabrica = 'COL' THEN 'fábrica COL: toda composta do load'
            ELSE 'primeira composta do load' END AS motivo
FROM vw_compostas v
JOIN compostas c ON c.id = v.id
CROSS JOIN LATERAL (
    SELECT c.coliformes_obrigatorio
           AND (c.embarque_id IS NOT NULL OR v.fabrica = 'COL'
                OR NOT EXISTS (SELECT 1 FROM compostas c2 JOIN testes t ON t.composta_id = c2.id AND t.tipo = 'COLIFORMES'
                               WHERE c2.load_id = c.load_id)) AS obrigatorio
) o
WHERE NOT EXISTS (SELECT 1 FROM testes t WHERE t.tipo = 'COLIFORMES' AND t.composta_id = v.id);

GRANT SELECT ON vw_coliformes_pendentes TO labflow_app, labflow_app_web, labflow_leitura;

COMMIT;
