-- 101 — compostas do embarque de FCOJ: o Coliformes nasce junto; TAB e Howard só quando o analista pedir (pedido PB20 do app)
--
-- Decisão do Danyllo de 25/10/2026. Depende da 043 (teste_feito, teste_acao) e da 045 (criar_compostas_embarque). Aplicar, como
-- labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 101_compostas_embarque_coliformes.sql
-- Desfazer: 101_compostas_embarque_coliformes_desfazer.sql.
--
--   criar_compostas_embarque (a mesma do bot e do app): cada composta nova já ganha o Coliformes no caldo, com a data de hoje
--     (São Paulo) e estriar no dia seguinte, como o "coliformes feitos"; o texto e o retorno trazem coliformes_em e estriar_em.
--   criar_teste_da_composta(quem, composta_id, 'TAB'|'COLIFORMES'|'HOWARD', percentual DEFAULT NULL, previa DEFAULT false)
--     -> TAB ou Coliformes no caldo hoje (teste_feito); Howard com o percentual (teste_acao 'howard': par de 0 a 100, só
--        composta de embarque). Admin e Analista. GRANT ao labflow_app_web (pedido do app) e ao labflow_app.

BEGIN;

CREATE OR REPLACE FUNCTION criar_compostas_embarque(p_quem bigint, p_navio text, p_linha int, p_fase int, p_grupos jsonb,
                                                    p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_navio  text := upper(trim(COALESCE(p_navio, '')));
    v_em     bigint;
    v_erros  text;
    v_ids    bigint[] := '{}';
    v_cid    bigint;
    g        record;
    v_linhas text[] := '{}';
    v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF p_grupos IS NULL OR jsonb_typeof(p_grupos) <> 'array' OR jsonb_array_length(p_grupos) = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_grupos) x WHERE jsonb_typeof(x) <> 'array' OR jsonb_array_length(x) = 0) THEN
        RAISE EXCEPTION 'Diga as amostras de cada composta, ex.: (A1-A5)(A6-A10).';
    END IF;
    SELECT e.id INTO v_em FROM embarques e JOIN navios n ON n.id = e.navio_id
    WHERE upper(trim(n.nome || ' ' || n.viagem)) = v_navio AND e.linha = p_linha AND e.fase = p_fase;
    IF v_em IS NULL THEN
        RAISE EXCEPTION 'Embarque % linha % fase % não encontrado. Registre o embarque primeiro.', v_navio, p_linha, p_fase;
    END IF;
    WITH pedidos AS (
        SELECT x::int AS numero FROM jsonb_array_elements(p_grupos) gg, jsonb_array_elements_text(gg) x
    ), am AS (
        SELECT p.numero, ea.id AS ea_id, (SELECT cl.composta_id FROM composta_lotes cl WHERE cl.embarque_amostra_id = ea.id) AS ja_em,
               count(*) OVER (PARTITION BY p.numero) AS vezes
        FROM pedidos p LEFT JOIN embarque_amostras ea ON ea.embarque_id = v_em AND ea.numero = p.numero
    )
    SELECT string_agg(DISTINCT CASE WHEN ea_id IS NULL THEN 'amostra A' || numero || ' não foi registrada'
                                    WHEN ja_em IS NOT NULL THEN 'amostra A' || numero || ' já está na composta #' || ja_em
                                    ELSE 'amostra A' || numero || ' aparece em duas compostas' END, '; ')
    INTO v_erros FROM am WHERE ea_id IS NULL OR ja_em IS NOT NULL OR vezes > 1;
    IF v_erros IS NOT NULL THEN
        RAISE EXCEPTION 'Nenhuma composta criada: %.', v_erros;
    END IF;
    FOR g IN SELECT val, ord FROM jsonb_array_elements(p_grupos) WITH ORDINALITY AS t(val, ord) ORDER BY ord LOOP
        v_linhas := v_linhas || ('amostras ' || (SELECT string_agg('A' || x, ',' ORDER BY x::int) FROM jsonb_array_elements_text(g.val) x));
        IF NOT p_previa THEN
            INSERT INTO compostas (embarque_id, criada_por) VALUES (v_em, p_quem) RETURNING id INTO v_cid;
            INSERT INTO composta_lotes (composta_id, embarque_amostra_id)
            SELECT v_cid, ea.id FROM embarque_amostras ea
            WHERE ea.embarque_id = v_em AND ea.numero IN (SELECT x::int FROM jsonb_array_elements_text(g.val) x);
            -- o Coliformes nasce junto, já no caldo (decisão de 25/10/2026); TAB e Howard só pela criar_teste_da_composta
            INSERT INTO testes (tipo, composta_id, status, data_feito, feito_por, espalhar_prevista)
            VALUES ('COLIFORMES', v_cid, 'No caldo', v_hoje, p_quem, v_hoje + 1);
            v_ids := v_ids || v_cid;
            v_linhas[cardinality(v_linhas)] := '#' || v_cid || ' ' || v_linhas[cardinality(v_linhas)];
        END IF;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'ids', to_jsonb(v_ids), 'criadas', cardinality(v_ids),
        'texto', jsonb_array_length(p_grupos) || ' composta' || CASE WHEN jsonb_array_length(p_grupos) > 1 THEN 's' ELSE '' END
                 || ' em ' || v_navio || ' linha ' || p_linha || ' fase ' || p_fase || ': ' || array_to_string(v_linhas, '; ') || '.'
                 || ' Coliformes no caldo em ' || to_char(v_hoje, 'DD/MM/YYYY') || '; estriar em ' || to_char(v_hoje + 1, 'DD/MM/YYYY') || '.',
        'coliformes_em', to_char(v_hoje, 'DD/MM/YYYY'), 'estriar_em', to_char(v_hoje + 1, 'DD/MM/YYYY'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION criar_teste_da_composta(p_quem bigint, p_composta_id bigint, p_tipo text, p_percentual numeric DEFAULT NULL,
                                                   p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_tipo text := upper(trim(COALESCE(p_tipo, '')));
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF p_composta_id IS NULL OR NOT EXISTS (SELECT 1 FROM compostas WHERE id = p_composta_id) THEN
        RAISE EXCEPTION 'Composta #% não existe.', p_composta_id;
    END IF;
    IF v_tipo IN ('TAB', 'COLIFORMES') THEN
        -- no caldo hoje, como o "tab feito" / "coliformes feitos" (a teste_feito diz se a composta já tinha)
        RETURN teste_feito(p_quem, v_tipo, ARRAY[p_composta_id], (now() AT TIME ZONE 'America/Sao_Paulo')::date, p_previa);
    ELSIF v_tipo = 'HOWARD' THEN
        IF p_percentual IS NULL THEN
            RAISE EXCEPTION 'Diga o Howard: um percentual par de 0 a 100 (50 campos, cada campo positivo vale 2%%).';
        END IF;
        IF p_previa THEN
            RETURN jsonb_build_object('ok', true, 'previa', true, 'texto', 'Howard da composta #' || p_composta_id || ': ' || trim_scale(p_percentual) || '%.');
        END IF;
        RETURN teste_acao(p_quem, 'howard', 'HOWARD', ARRAY[p_composta_id], NULL, p_percentual);
    END IF;
    RAISE EXCEPTION 'Teste inválido: TAB, Coliformes ou Howard.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION criar_teste_da_composta(bigint, bigint, text, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION criar_teste_da_composta(bigint, bigint, text, numeric, boolean) TO labflow_app, labflow_app_web;

COMMIT;
