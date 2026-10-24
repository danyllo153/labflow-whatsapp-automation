-- 043 — compostas, TAB, Coliformes e Howard por funções do banco (pedido PB13 da sessão do app, Fase E)
--
-- Depende da 042 (tanque_exigir_cargo, bot_quem). Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 043_testes_funcoes.sql
-- Desfazer: 043_testes_funcoes_desfazer.sql (publique antes o workflow que ainda não chama estas funções).
--
-- Regra da Fase E: o bot e o app chamam a MESMA função. Estas repetem o que o bot faz hoje:
--   criar_compostas(quem, load, item, grupos [[1,2,3],[4,5]], previa DEFAULT false)
--     -> uma composta (#N) por grupo de lotes do recebimento; o lote precisa estar recebido e fora de outra composta;
--        load com o mesmo número em dois itens: pede o item.
--   teste_feito(quem, tipo TAB|COLIFORMES, composta_ids, data, previa DEFAULT false)
--     -> o teste entra no caldo na data (espalhar/estriar em +5 dias no TAB, +1 nos Coliformes); a composta que já tem esse
--        teste fica como está (volta em ja_tinham); composta que não existe: recusa tudo.
--   teste_acao(quem, acao, tipo, ids, resultado DEFAULT NULL, percentual DEFAULT NULL)  (ids = testes; no Howard, a composta)
--     espalhar   -> No caldo vira Incubada (TAB, leitura em +5) ou Estriada (Coliformes, leitura em +1)
--     confirmar  -> TAB Incubada vira Em confirmação (ler o PCA em +1)
--     negativos  -> Incubada/Estriada vira Concluída Negativo
--     resultado  -> TAB Em confirmação, ou o lote aberto dos Coliformes Estriado, vira Concluída com o resultado
--     abrir      -> Coliformes da composta (no caldo, estriado ou positivo) vira Em confirmação e abre um teste por lote
--     howard     -> Howard da composta de embarque, % par de 0 a 100 (50 campos, cada positivo vale 2%), já concluído
--     A composta aberta fecha sozinha quando todos os lotes têm resultado (positiva se algum lote deu positivo).
--     Teste fora da etapa fica como está (volta em ignorados), como o bot faz hoje.
-- Admin e Analista. Devolvem jsonb {ok: true, ..., texto}; erro de regra sai como exceção em português; as portas de entrada
-- do bot (..._pelo_bot) devolvem {ok: false, erro}. SECURITY DEFINER com search_path fixo; o GRANT do app fica com o app.

BEGIN;

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

CREATE OR REPLACE FUNCTION teste_feito(p_quem bigint, p_tipo text, p_composta_ids bigint[], p_data date, p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_tipo   text := upper(trim(COALESCE(p_tipo, '')));
    v_ids    bigint[];
    v_inex   text;
    v_ja     text;
    v_novos  bigint[];
    v_esp    date;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF v_tipo NOT IN ('TAB', 'COLIFORMES') THEN
        RAISE EXCEPTION 'Teste inválido: TAB ou Coliformes.';
    END IF;
    IF p_data IS NULL THEN
        RAISE EXCEPTION 'Diga a data.';
    END IF;
    SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids FROM unnest(p_composta_ids) x WHERE x IS NOT NULL;
    IF v_ids IS NULL THEN
        RAISE EXCEPTION 'Diga as compostas.';
    END IF;
    SELECT string_agg('#' || x, ', ' ORDER BY x) INTO v_inex FROM unnest(v_ids) x WHERE x NOT IN (SELECT id FROM compostas);
    IF v_inex IS NOT NULL THEN
        RAISE EXCEPTION 'Composta % não existe.', v_inex;
    END IF;
    SELECT string_agg('#' || t.composta_id, ', ' ORDER BY t.composta_id) INTO v_ja FROM testes t WHERE t.tipo = v_tipo AND t.composta_id = ANY (v_ids);
    SELECT array_agg(x ORDER BY x) INTO v_novos FROM unnest(v_ids) x
    WHERE NOT EXISTS (SELECT 1 FROM testes t WHERE t.tipo = v_tipo AND t.composta_id = x);
    v_esp := p_data + CASE WHEN v_tipo = 'TAB' THEN 5 ELSE 1 END;
    IF NOT p_previa AND v_novos IS NOT NULL THEN
        INSERT INTO testes (tipo, composta_id, status, data_feito, feito_por, espalhar_prevista)
        SELECT v_tipo, x, 'No caldo', p_data, p_quem, v_esp FROM unnest(v_novos) x;
    END IF;
    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'criados', COALESCE(to_jsonb(v_novos), '[]'::jsonb), 'ja_tinham', v_ja,
        'espalhar_em', to_char(v_esp, 'DD/MM/YYYY'),
        'texto', CASE WHEN v_novos IS NULL THEN 'Todas já tinham ' || CASE WHEN v_tipo = 'TAB' THEN 'TAB' ELSE 'Coliformes' END || '; nada novo.'
                      ELSE CASE WHEN v_tipo = 'TAB' THEN 'TAB' ELSE 'Coliformes' END || ' no caldo em ' || to_char(p_data, 'DD/MM/YYYY') || ': '
                           || (SELECT string_agg('#' || x, ', ' ORDER BY x) FROM unnest(v_novos) x)
                           || '; ' || CASE WHEN v_tipo = 'TAB' THEN 'espalhar' ELSE 'estriar' END || ' em ' || to_char(v_esp, 'DD/MM/YYYY') || '.' END
                 || COALESCE(' Já tinham (ficam como estão): ' || v_ja || '.', ''));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION teste_acao(p_quem bigint, p_acao text, p_tipo text, p_ids bigint[], p_resultado text DEFAULT NULL,
                                      p_percentual numeric DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
    v_acao  text := lower(trim(COALESCE(p_acao, '')));
    v_tipo  text := upper(trim(COALESCE(p_tipo, 'TAB')));
    v_res   text := initcap(lower(trim(COALESCE(p_resultado, ''))));
    v_ids   bigint[] := COALESCE(p_ids, '{}');
    v_up    int := 0;
    v_fil   int := 0;
    v_pais  int := 0;
    v_how   int := 0;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF v_acao NOT IN ('espalhar', 'confirmar', 'negativos', 'resultado', 'abrir', 'howard') THEN
        RAISE EXCEPTION 'Ação inválida: %.', p_acao;
    END IF;
    IF cardinality(v_ids) = 0 THEN
        RAISE EXCEPTION 'Diga os testes.';
    END IF;
    IF v_acao = 'howard' THEN
        IF p_percentual IS NULL OR p_percentual < 0 OR p_percentual > 100 OR p_percentual <> trunc(p_percentual) OR (p_percentual::int % 2) <> 0 THEN
            RAISE EXCEPTION 'Howard inválido: use um percentual par de 0 a 100 (50 campos, cada campo positivo vale 2%%).';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM compostas WHERE id = v_ids[1] AND embarque_id IS NOT NULL) THEN
            RAISE EXCEPTION 'O Howard é da composta de embarque: a composta #% não é de embarque.', v_ids[1];
        END IF;
        INSERT INTO testes (tipo, composta_id, status, data_feito, feito_por, percentual, campos_positivos, resultado_em, resultado_por)
        VALUES ('HOWARD', v_ids[1], 'Concluída', CURRENT_DATE, p_quem, p_percentual, (p_percentual / 2)::int, now(), p_quem)
        ON CONFLICT (tipo, composta_id) DO UPDATE
          SET percentual = EXCLUDED.percentual, campos_positivos = EXCLUDED.campos_positivos, data_feito = EXCLUDED.data_feito,
              feito_por = EXCLUDED.feito_por, resultado_em = EXCLUDED.resultado_em, resultado_por = EXCLUDED.resultado_por;
        RETURN jsonb_build_object('ok', true, 'howards', 1, 'atualizados', 0, 'ignorados', 0,
            'texto', 'Howard da composta #' || v_ids[1] || ': ' || trim_scale(p_percentual) || '% (' || (p_percentual / 2)::int || ' campos positivos de 50).');
    END IF;
    IF v_tipo NOT IN ('TAB', 'COLIFORMES') THEN
        RAISE EXCEPTION 'Teste inválido: TAB ou Coliformes.';
    END IF;
    IF v_acao = 'resultado' AND v_res NOT IN ('Positivo', 'Negativo') THEN
        RAISE EXCEPTION 'Resultado inválido: positivo ou negativo.';
    END IF;
    IF v_acao = 'confirmar' AND v_tipo <> 'TAB' THEN
        RAISE EXCEPTION 'Só o TAB vai para confirmação; nos Coliformes, abra a composta.';
    END IF;
    IF v_acao = 'abrir' AND v_tipo <> 'COLIFORMES' THEN
        RAISE EXCEPTION 'Abrir lote a lote é dos Coliformes.';
    END IF;

    WITH up AS (
        UPDATE testes t
        SET status = CASE WHEN v_acao = 'espalhar' THEN CASE WHEN v_tipo = 'TAB' THEN 'Incubada' ELSE 'Estriada' END
                          WHEN v_acao IN ('abrir', 'confirmar') THEN 'Em confirmação'
                          ELSE 'Concluída' END,
            espalhado_em  = CASE WHEN v_acao = 'espalhar' THEN now() ELSE t.espalhado_em END,
            espalhado_por = CASE WHEN v_acao = 'espalhar' THEN p_quem ELSE t.espalhado_por END,
            leitura_prevista = CASE WHEN v_acao = 'espalhar' THEN CURRENT_DATE + (CASE WHEN v_tipo = 'TAB' THEN 5 ELSE 1 END)
                                    ELSE t.leitura_prevista END,
            confirmacao_prevista = CASE WHEN v_acao = 'confirmar' THEN CURRENT_DATE + 1 ELSE t.confirmacao_prevista END,
            confirmacao_em  = CASE WHEN v_acao IN ('abrir', 'confirmar') THEN now() ELSE t.confirmacao_em END,
            confirmacao_por = CASE WHEN v_acao IN ('abrir', 'confirmar') THEN p_quem ELSE t.confirmacao_por END,
            resultado     = CASE WHEN v_acao = 'negativos' THEN 'Negativo' WHEN v_acao = 'resultado' THEN v_res
                                 WHEN v_acao = 'abrir' THEN NULL ELSE t.resultado END,
            resultado_em  = CASE WHEN v_acao IN ('negativos', 'resultado') THEN now() WHEN v_acao = 'abrir' THEN NULL ELSE t.resultado_em END,
            resultado_por = CASE WHEN v_acao IN ('negativos', 'resultado') THEN p_quem WHEN v_acao = 'abrir' THEN NULL ELSE t.resultado_por END
        WHERE t.tipo = v_tipo AND t.id = ANY (v_ids)
          AND (   (v_acao = 'espalhar'  AND t.status = 'No caldo')
               OR (v_acao = 'confirmar' AND t.status = 'Incubada')
               OR (v_acao = 'negativos' AND t.status IN ('Incubada', 'Estriada'))
               OR (v_acao = 'resultado' AND ((v_tipo = 'TAB' AND t.status = 'Em confirmação')
                                          OR (v_tipo = 'COLIFORMES' AND t.teste_pai_id IS NOT NULL AND t.status = 'Estriada')))
               OR (v_acao = 'abrir' AND t.teste_pai_id IS NULL
                   AND (t.status IN ('No caldo', 'Estriada') OR (t.status = 'Concluída' AND t.resultado = 'Positivo'))))
        RETURNING t.id, t.teste_pai_id, t.composta_id
    ), filhos AS (
        INSERT INTO testes (tipo, recebimento_lote_id, embarque_amostra_id, teste_pai_id, status, data_feito, feito_por, espalhar_prevista)
        SELECT 'COLIFORMES', cl.recebimento_lote_id, cl.embarque_amostra_id, up.id, 'No caldo', CURRENT_DATE, p_quem, CURRENT_DATE + 1
        FROM up JOIN composta_lotes cl ON cl.composta_id = up.composta_id
        WHERE v_acao = 'abrir'
        ON CONFLICT DO NOTHING
        RETURNING id
    ), pais AS (
        UPDATE testes pai
        SET status = 'Concluída',
            resultado = CASE WHEN v_res = 'Positivo'
                               OR EXISTS (SELECT 1 FROM testes f WHERE f.teste_pai_id = pai.id AND f.resultado = 'Positivo'
                                          AND f.id NOT IN (SELECT id FROM up))
                             THEN 'Positivo' ELSE 'Negativo' END,
            resultado_em = now(), resultado_por = p_quem
        WHERE v_acao IN ('resultado', 'negativos')
          AND pai.id IN (SELECT teste_pai_id FROM up WHERE teste_pai_id IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM testes f WHERE f.teste_pai_id = pai.id AND f.status <> 'Concluída'
                          AND f.id NOT IN (SELECT id FROM up))
        RETURNING pai.id
    )
    SELECT (SELECT count(*) FROM up), (SELECT count(*) FROM filhos), (SELECT count(*) FROM pais) INTO v_up, v_fil, v_pais;

    RETURN jsonb_build_object('ok', true, 'atualizados', v_up, 'ignorados', cardinality(v_ids) - v_up, 'lotes_abertos', v_fil,
        'compostas_fechadas', v_pais, 'howards', v_how,
        'texto', v_up || ' teste' || CASE WHEN v_up = 1 THEN '' ELSE 's' END || ' atualizado' || CASE WHEN v_up = 1 THEN '' ELSE 's' END || '.'
                 || CASE WHEN v_fil > 0 THEN ' ' || v_fil || ' lote' || CASE WHEN v_fil = 1 THEN '' ELSE 's' END || ' aberto' || CASE WHEN v_fil = 1 THEN '' ELSE 's' END || ' (estriar amanhã).' ELSE '' END
                 || CASE WHEN v_pais > 0 THEN ' ' || v_pais || ' composta' || CASE WHEN v_pais = 1 THEN '' ELSE 's' END || ' fechada' || CASE WHEN v_pais = 1 THEN '' ELSE 's' END || '.' ELSE '' END
                 || CASE WHEN cardinality(v_ids) > v_up THEN ' ' || (cardinality(v_ids) - v_up) || ' fora da etapa ficou como estava.' ELSE '' END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- portas de entrada do bot ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compostas_criar_pelo_bot(p_telefone text, p_load text, p_item text, p_grupos jsonb) RETURNS jsonb AS $$
BEGIN
    RETURN criar_compostas(bot_quem(p_telefone), p_load, p_item, p_grupos);
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok', false, 'erro', 'Lote inválido.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION teste_feito_pelo_bot(p_telefone text, p_tipo text, p_ids jsonb, p_data text) RETURNS jsonb AS $$
BEGIN
    RETURN teste_feito(bot_quem(p_telefone), p_tipo, ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_ids, '[]'::jsonb))::bigint),
                       to_date(p_data, 'DD/MM/YYYY'));
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN jsonb_build_object('ok', false, 'erro', 'Data inválida.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- a pendência do "sim" do TAB/Coliformes/Howard: {acao, tipo, ids, resultado?, percentual?}
CREATE OR REPLACE FUNCTION teste_acao_pelo_bot(p_telefone text, p_dados jsonb) RETURNS jsonb AS $$
BEGIN
    RETURN teste_acao(bot_quem(p_telefone), p_dados ->> 'acao', COALESCE(p_dados ->> 'tipo', 'TAB'),
                      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_dados -> 'ids', '[]'::jsonb))::bigint),
                      p_dados ->> 'resultado', (p_dados ->> 'percentual')::numeric);
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok', false, 'erro', 'Número inválido.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION criar_compostas(bigint, text, text, jsonb, boolean), teste_feito(bigint, text, bigint[], date, boolean),
                       teste_acao(bigint, text, text, bigint[], text, numeric), compostas_criar_pelo_bot(text, text, text, jsonb),
                       teste_feito_pelo_bot(text, text, jsonb, text), teste_acao_pelo_bot(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION criar_compostas(bigint, text, text, jsonb, boolean), teste_feito(bigint, text, bigint[], date, boolean),
                          teste_acao(bigint, text, text, bigint[], text, numeric), compostas_criar_pelo_bot(text, text, text, jsonb),
                          teste_feito_pelo_bot(text, text, jsonb, text), teste_acao_pelo_bot(text, jsonb) TO labflow_app;

COMMIT;
