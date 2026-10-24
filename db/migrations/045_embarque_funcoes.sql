-- 045 — embarque por funções do banco: amostras e compostas do embarque (pedido PB12 da sessão do app, Fase E)
--
-- Depende da 042 (tanque_exigir_cargo, bot_quem) e da 040 (lista_compacta). Os resultados de C.T/B.L por amostra já são da
-- lancar_contagem (040) e o Howard da teste_acao (043). Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 045_embarque_funcoes.sql
-- Desfazer: 045_embarque_funcoes_desfazer.sql (publique antes o workflow que ainda não chama estas funções).
--
-- Regra da Fase E: o bot e o app chamam a MESMA função. Estas repetem o que o bot faz hoje:
--   registrar_embarque(quem, navio, linha, fase, load, item, amostras, data, previa DEFAULT false)
--     -> o navio, o embarque (navio + linha + fase) e o load (se novos; o load novo fica sem fábrica, com aviso) e as amostras
--        A1, A2...; amostra já registrada nessa linha e fase fica como está (volta em existentes, com o load dela);
--        avisa se o mesmo número de load já existe com outro item.
--   criar_compostas_embarque(quem, navio, linha, fase, grupos [[1,2],[3,4]], previa DEFAULT false)
--     -> uma composta (#N) por grupo de amostras; a amostra precisa estar registrada e fora de outra composta.
-- Admin e Analista. jsonb {ok: true, ..., texto}; erro de regra sai como exceção em português; as portas de entrada do bot
-- devolvem {ok: false, erro}. SECURITY DEFINER com search_path fixo; o GRANT do app fica com o app.

BEGIN;

CREATE OR REPLACE FUNCTION registrar_embarque(p_quem bigint, p_navio text, p_linha int, p_fase int, p_load text, p_item text,
                                              p_amostras int[], p_data date, p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_navio  text := upper(trim(COALESCE(p_navio, '')));
    v_nome   text;
    v_viagem text;
    v_load   text := trim(COALESCE(p_load, ''));
    v_item   text := trim(COALESCE(p_item, ''));
    v_am     int[];
    v_nav    bigint;
    v_em     bigint;
    v_it     bigint;
    v_ld     bigint;
    v_novo   boolean;
    v_exist  jsonb;
    v_novas  int[];
    v_outros text;
    v_texto  text;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    v_nome := upper(trim(regexp_replace(v_navio, '\s*\d+\s*$', '')));
    v_viagem := COALESCE(substring(v_navio from '(\d+)\s*$'), '');
    IF v_nome = '' OR v_viagem = '' THEN
        RAISE EXCEPTION 'Informe o navio com a viagem (ex.: O.SKY 133).';
    END IF;
    IF p_linha IS NULL OR p_linha < 1 OR p_fase IS NULL OR p_fase < 1 THEN
        RAISE EXCEPTION 'Linha e fase são números a partir de 1.';
    END IF;
    IF v_load !~ '^[A-Za-z0-9]+$' OR v_item !~ '^[A-Za-z0-9]+$' THEN
        RAISE EXCEPTION 'Load e item são só letras e números (ex.: load 77010 item 444).';
    END IF;
    IF p_data IS NULL THEN
        RAISE EXCEPTION 'Diga a data do embarque.';
    END IF;
    SELECT array_agg(DISTINCT n ORDER BY n) INTO v_am FROM unnest(p_amostras) n WHERE n IS NOT NULL;
    IF v_am IS NULL OR v_am[1] < 1 THEN
        RAISE EXCEPTION 'Diga as amostras (ex.: 1-10 ou A1-A5,A7).';
    END IF;
    IF cardinality(v_am) > 200 THEN
        RAISE EXCEPTION 'Máximo de 200 amostras por vez.';
    END IF;

    SELECT id INTO v_nav FROM navios WHERE nome = v_nome AND viagem = v_viagem;
    SELECT id INTO v_em FROM embarques WHERE navio_id = v_nav AND linha = p_linha AND fase = p_fase;
    SELECT l.id INTO v_ld FROM loads l JOIN itens i ON i.id = l.item_id WHERE l.numero = v_load AND i.codigo = v_item;
    v_novo := v_ld IS NULL;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('numero', ea.numero, 'load', l2.numero) ORDER BY ea.numero), '[]'::jsonb)
    INTO v_exist FROM embarque_amostras ea JOIN loads l2 ON l2.id = ea.load_id
    WHERE ea.embarque_id = v_em AND ea.numero = ANY (v_am);
    SELECT array_agg(n ORDER BY n) INTO v_novas FROM unnest(v_am) n
    WHERE NOT EXISTS (SELECT 1 FROM embarque_amostras ea WHERE ea.embarque_id = v_em AND ea.numero = n);
    SELECT string_agg(DISTINCT i.codigo, ', ') INTO v_outros FROM loads l JOIN itens i ON i.id = l.item_id
    WHERE l.numero = v_load AND i.codigo <> v_item;

    v_texto := v_nome || ' ' || v_viagem || ' linha ' || p_linha || ' fase ' || p_fase || ', load ' || v_load || ' (item ' || v_item || '): '
        || CASE WHEN v_novas IS NULL THEN 'todas essas amostras já estavam registradas, nada novo.'
                ELSE 'amostras ' || (SELECT string_agg('A' || n, ', ' ORDER BY n) FROM unnest(v_novas) n) || ' (' || cardinality(v_novas)
                     || '), embarque de ' || to_char(p_data, 'DD/MM/YYYY') || '.' END
        || CASE WHEN v_novo THEN ' O load ' || v_load || ' não está cadastrado: entra agora, sem fábrica.' ELSE '' END
        || COALESCE(' Já existe o load ' || v_load || ' com outro item (' || v_outros || ').', '');
    IF NOT p_previa AND v_novas IS NOT NULL THEN
        INSERT INTO navios (nome, viagem) VALUES (v_nome, v_viagem)
        ON CONFLICT (nome, viagem) DO UPDATE SET nome = EXCLUDED.nome RETURNING id INTO v_nav;
        INSERT INTO embarques (navio_id, linha, fase, criado_por) VALUES (v_nav, p_linha, p_fase, p_quem)
        ON CONFLICT (navio_id, linha, fase) DO UPDATE SET linha = EXCLUDED.linha RETURNING id INTO v_em;
        IF v_novo THEN
            INSERT INTO itens (codigo) VALUES (v_item) ON CONFLICT (codigo) DO UPDATE SET codigo = EXCLUDED.codigo RETURNING id INTO v_it;
            INSERT INTO loads (numero, item_id, criado_por) VALUES (v_load, v_it, p_quem) RETURNING id INTO v_ld;
        END IF;
        INSERT INTO embarque_amostras (embarque_id, load_id, numero, data_embarque, registrado_por)
        SELECT v_em, v_ld, n, p_data, p_quem FROM unnest(v_novas) n
        ON CONFLICT (embarque_id, numero) DO NOTHING;
    END IF;
    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'novas', COALESCE(to_jsonb(v_novas), '[]'::jsonb), 'existentes', v_exist,
        'load_novo', v_novo AND v_novas IS NOT NULL, 'outros_itens', v_outros, 'texto', v_texto);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
            v_ids := v_ids || v_cid;
            v_linhas[cardinality(v_linhas)] := '#' || v_cid || ' ' || v_linhas[cardinality(v_linhas)];
        END IF;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'ids', to_jsonb(v_ids), 'criadas', cardinality(v_ids),
        'texto', jsonb_array_length(p_grupos) || ' composta' || CASE WHEN jsonb_array_length(p_grupos) > 1 THEN 's' ELSE '' END
                 || ' em ' || v_navio || ' linha ' || p_linha || ' fase ' || p_fase || ': ' || array_to_string(v_linhas, '; ') || '.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- portas de entrada do bot ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION embarque_registrar_pelo_bot(p_telefone text, p_navio text, p_linha text, p_fase text, p_load text,
                                                       p_item text, p_amostras jsonb, p_data text) RETURNS jsonb AS $$
BEGIN
    RETURN registrar_embarque(bot_quem(p_telefone), p_navio, p_linha::int, p_fase::int, p_load, p_item,
                              ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_amostras, '[]'::jsonb))::int), to_date(p_data, 'DD/MM/YYYY'));
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Linha, fase, amostra ou data inválidas.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION compostas_embarque_criar_pelo_bot(p_telefone text, p_navio text, p_linha text, p_fase text, p_grupos jsonb)
RETURNS jsonb AS $$
BEGIN
    RETURN criar_compostas_embarque(bot_quem(p_telefone), p_navio, p_linha::int, p_fase::int, p_grupos);
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok', false, 'erro', 'Linha, fase ou amostra inválidas.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION registrar_embarque(bigint, text, int, int, text, text, int[], date, boolean),
                       criar_compostas_embarque(bigint, text, int, int, jsonb, boolean),
                       embarque_registrar_pelo_bot(text, text, text, text, text, text, jsonb, text),
                       compostas_embarque_criar_pelo_bot(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registrar_embarque(bigint, text, int, int, text, text, int[], date, boolean),
                          criar_compostas_embarque(bigint, text, int, int, jsonb, boolean),
                          embarque_registrar_pelo_bot(text, text, text, text, text, text, jsonb, text),
                          compostas_embarque_criar_pelo_bot(text, text, text, text, jsonb) TO labflow_app;

COMMIT;
