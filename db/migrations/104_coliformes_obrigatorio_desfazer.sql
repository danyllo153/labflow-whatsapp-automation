-- Desfaz a 104: a view volta à da 103, a criar_compostas volta à da 043 e a marca do Coliformes obrigatório sai. Backup antes.
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 104_coliformes_obrigatorio_desfazer.sql

BEGIN;

DROP VIEW IF EXISTS vw_coliformes_pendentes;
CREATE OR REPLACE VIEW vw_coliformes_pendentes AS
SELECT v.id AS composta_id, v.origem, v.rotulo, v.load, v.item, v.lotes, c.criada_em
FROM vw_compostas v
JOIN compostas c ON c.id = v.id
WHERE NOT EXISTS (SELECT 1 FROM testes t WHERE t.tipo = 'COLIFORMES' AND t.composta_id = v.id);

GRANT SELECT ON vw_coliformes_pendentes TO labflow_app, labflow_app_web, labflow_leitura;

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

    FOR g IN SELECT val, ord FROM jsonb_array_elements(p_grupos) WITH ORDINALITY AS t(val, ord) ORDER BY ord LOOP
        v_linhas := v_linhas || ('lotes ' || lista_compacta(ARRAY(SELECT x::int FROM jsonb_array_elements_text(g.val) x)));
        IF NOT p_previa THEN
            INSERT INTO compostas (load_id, criada_por) VALUES (v_ld, p_quem) RETURNING id INTO v_cid;
            INSERT INTO composta_lotes (composta_id, recebimento_lote_id)
            SELECT v_cid, rl.id FROM recebimento_lotes rl
            WHERE rl.load_id = v_ld AND rl.lote IN (SELECT x::int FROM jsonb_array_elements_text(g.val) x);
            v_ids := v_ids || v_cid;
            v_linhas[cardinality(v_linhas)] := '#' || v_cid || ' ' || v_linhas[cardinality(v_linhas)];
        END IF;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'ids', to_jsonb(v_ids), 'criadas', cardinality(v_ids),
        'texto', jsonb_array_length(p_grupos) || ' composta' || CASE WHEN jsonb_array_length(p_grupos) > 1 THEN 's' ELSE '' END
                 || ' no load ' || v_load || ': ' || array_to_string(v_linhas, '; ') || '.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS compostas_coliformes_obrigatorio ON compostas;
DROP FUNCTION IF EXISTS compostas_marcar_coliformes();
ALTER TABLE compostas DROP COLUMN IF EXISTS coliformes_obrigatorio;

COMMIT;
