-- 040 — registrar o recebimento de FCOJ e lançar C.T/B.L por funções do banco (pedido PB11 da sessão do app, Fase E)
--
-- Depende da 036 (recebimento_exigir_permissao) e da 033 (historico_alteracoes). Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 040_recebimento_registrar_lancar.sql
-- Desfazer: 040_recebimento_registrar_lancar_desfazer.sql.
--
-- Regra da Fase E: cada coisa que o bot grava vira UMA função do banco, chamada igual pelo bot e pelo app (mesmo cargo,
-- mesmas mensagens). Estas repetem o que o bot faz hoje em "BD · Gravar recebimento" e no lançamento de C.T/B.L:
--
--   registrar_recebimento(quem, load, item, fabrica, lotes, data, resultados_menor10 DEFAULT false, previa DEFAULT false)
--     -> cria o load (se novo) e os lotes; lote já recebido é ignorado (não é erro); fábrica só uma das seis (AQA, CON, COL,
--        UCH, ITA, TMG); item 129 é o NFC e é recusado aqui; load já cadastrado com outra fábrica: recusado.
--        resultados_menor10 (só Admin, vem do TAB que abre a composta): C.T, B.L 72h e B.L 120h dos lotes NOVOS = <10.
--   lancar_contagem(quem, analise, itens, previa DEFAULT false)
--     -> itens = [{"recebimento_lote_id": 12, "sinal": "<", "valor": 10}, {"embarque_amostra_id": 7, "sinal": "=", "valor": 250}]
--        (um ou vários: o bot lança vários lotes com um sim só). Análise CT, BL72 ou BL120; sinal <, = ou >. Repetir um
--        resultado corrige o anterior e, se o valor muda, fica no histórico. Alarme igual ao bot: C.T >= 200 e B.L >= 50
--        (sinal "<" nunca é alarme).
--
-- previa = true: não grava nada e devolve o que SERIA feito, com o texto da confirmação ("o que vai ser criado"), para o app
-- mostrar antes do botão Confirmar (no bot, o texto antes do "sim"). As duas devolvem jsonb {ok: true, ..., texto}; erro de
-- regra sai como exceção com a mensagem em português (o app mostra a mensagem; o bot, quando passar a usar, recebe pela porta
-- de entrada dele, como a 037 faz).
-- Quem pode: Admin e Analista (recebimento_exigir_permissao, da 036); Coletor, Consultor e desconhecidos: ninguém.
-- SECURITY DEFINER com search_path fixo e dono labflow_app, como a 036. O GRANT para o papel do app fica numa migration do app.

BEGIN;

-- [1,2,3,5,7,8] -> "1-3, 5, 7-8" (mesma compactação das respostas do bot)
CREATE OR REPLACE FUNCTION lista_compacta(p_nums int[]) RETURNS text AS $$
    SELECT string_agg(CASE WHEN ini = fim THEN ini::text ELSE ini || '-' || fim END, ', ' ORDER BY ini)
    FROM (SELECT min(n) AS ini, max(n) AS fim
          FROM (SELECT n, n - row_number() OVER (ORDER BY n) AS g FROM (SELECT DISTINCT unnest(p_nums) AS n) d) x
          GROUP BY g) y;
$$ LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION registrar_recebimento(p_quem bigint, p_load text, p_item text, p_fabrica text, p_lotes int[],
                                                 p_data date, p_resultados_menor10 boolean DEFAULT false,
                                                 p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_load     text := trim(COALESCE(p_load, ''));
    v_item     text := trim(COALESCE(p_item, ''));
    v_fab      text := upper(trim(COALESCE(p_fabrica, '')));
    v_lotes    int[];
    v_load_row loads;
    v_fab_cad  text;
    v_novos    int[];
    v_repet    int[];
    v_fab_id   bigint;
    v_item_id  bigint;
    v_res      int := 0;
    v_texto    text;
BEGIN
    PERFORM recebimento_exigir_permissao(p_quem);
    IF v_load !~ '^[A-Za-z0-9]+$' THEN
        RAISE EXCEPTION 'Load inválido: use só letras e números (ex.: 43670).';
    END IF;
    IF v_item !~ '^[A-Za-z0-9]+$' THEN
        RAISE EXCEPTION 'Item inválido: use só os números (ex.: 2549).';
    END IF;
    IF v_item = '129' THEN
        RAISE EXCEPTION 'O item 129 é o recebimento de NFC e cada lote precisa do tipo (past ou fresh) e da diluição.';
    END IF;
    IF v_fab NOT IN ('AQA', 'CON', 'COL', 'UCH', 'ITA', 'TMG') THEN
        RAISE EXCEPTION 'Fábrica "%" não reconhecida. Use AQA, CON, COL, UCH, ITA ou TMG.', p_fabrica;
    END IF;
    IF p_data IS NULL THEN
        RAISE EXCEPTION 'Diga a data do recebimento.';
    END IF;
    SELECT array_agg(DISTINCT n ORDER BY n) INTO v_lotes FROM unnest(p_lotes) n WHERE n IS NOT NULL;
    IF v_lotes IS NULL THEN
        RAISE EXCEPTION 'Diga os lotes (ex.: 1-14 ou 1-5,7,9-10).';
    END IF;
    IF v_lotes[1] < 1 THEN
        RAISE EXCEPTION 'Lote inválido: os lotes começam em 1.';
    END IF;
    IF cardinality(v_lotes) > 200 THEN
        RAISE EXCEPTION 'Máximo de 200 lotes por vez.';
    END IF;
    IF p_resultados_menor10 AND (SELECT cargo FROM usuarios WHERE id = p_quem) <> 'Admin' THEN
        RAISE EXCEPTION 'Só um Admin registra o recebimento já com os resultados <10.';
    END IF;

    SELECT l.* INTO v_load_row FROM loads l JOIN itens i ON i.id = l.item_id WHERE l.numero = v_load AND i.codigo = v_item FOR UPDATE OF l;
    IF FOUND THEN
        SELECT nome INTO v_fab_cad FROM fabricas WHERE id = v_load_row.fabrica_id;
        IF v_fab_cad IS DISTINCT FROM v_fab THEN
            RAISE EXCEPTION 'O load % (item %) já está cadastrado com a fábrica %, não %.', v_load, v_item, v_fab_cad, v_fab;
        END IF;
        SELECT array_agg(n ORDER BY n) FILTER (WHERE r.id IS NULL), array_agg(n ORDER BY n) FILTER (WHERE r.id IS NOT NULL)
        INTO v_novos, v_repet
        FROM unnest(v_lotes) n LEFT JOIN recebimento_lotes r ON r.load_id = v_load_row.id AND r.lote = n;
    ELSE
        v_novos := v_lotes;
    END IF;

    v_texto := CASE WHEN v_load_row.id IS NULL THEN 'Load ' || v_load || ' novo (item ' || v_item || ', fábrica ' || v_fab || ')'
                    ELSE 'Load ' || v_load || ' (item ' || v_item || ', fábrica ' || v_fab || ')' END
        || CASE WHEN v_novos IS NULL THEN ': todos esses lotes já tinham sido recebidos, nada novo.'
                ELSE ': lotes ' || lista_compacta(v_novos) || ' (' || cardinality(v_novos) || '), recebidos em ' || to_char(p_data, 'DD/MM/YYYY') || '.' END
        || CASE WHEN v_repet IS NULL THEN '' ELSE ' Já recebidos antes (ignorados): ' || lista_compacta(v_repet) || '.' END
        || CASE WHEN p_resultados_menor10 AND v_novos IS NOT NULL
                THEN ' C.T, B.L 72h e B.L 120h dos lotes novos entram como <10 (' || 3 * cardinality(v_novos) || ' resultados).' ELSE '' END;

    IF p_previa THEN
        RETURN jsonb_build_object('ok', true, 'previa', true, 'load_novo', v_load_row.id IS NULL,
            'novos', COALESCE(to_jsonb(v_novos), '[]'::jsonb), 'repetidos', COALESCE(to_jsonb(v_repet), '[]'::jsonb), 'texto', v_texto);
    END IF;

    IF v_load_row.id IS NULL THEN
        INSERT INTO itens (codigo) VALUES (v_item) ON CONFLICT (codigo) DO UPDATE SET codigo = EXCLUDED.codigo RETURNING id INTO v_item_id;
        INSERT INTO fabricas (nome) VALUES (v_fab) ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id INTO v_fab_id;
        INSERT INTO loads (numero, item_id, fabrica_id, criado_por) VALUES (v_load, v_item_id, v_fab_id, p_quem) RETURNING * INTO v_load_row;
    END IF;
    IF v_novos IS NOT NULL THEN
        INSERT INTO recebimento_lotes (load_id, lote, data_recebimento, registrado_por)
        SELECT v_load_row.id, n, p_data, p_quem FROM unnest(v_novos) n
        ON CONFLICT (load_id, lote) DO NOTHING;
        IF p_resultados_menor10 THEN
            INSERT INTO contagens (analise, recebimento_lote_id, sinal, valor, lido_por)
            SELECT a.analise, r.id, '<', 10, p_quem
            FROM recebimento_lotes r CROSS JOIN (VALUES ('CT'), ('BL72'), ('BL120')) AS a(analise)
            WHERE r.load_id = v_load_row.id AND r.lote = ANY (v_novos)
            ON CONFLICT (analise, recebimento_lote_id) DO NOTHING;
            GET DIAGNOSTICS v_res = ROW_COUNT;
        END IF;
    END IF;
    RETURN jsonb_build_object('ok', true, 'previa', false, 'load_id', v_load_row.id,
        'novos', COALESCE(to_jsonb(v_novos), '[]'::jsonb), 'repetidos', COALESCE(to_jsonb(v_repet), '[]'::jsonb),
        'resultados_gravados', v_res, 'texto', v_texto);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION lancar_contagem(p_quem bigint, p_analise text, p_itens jsonb, p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_an      text := upper(trim(COALESCE(p_analise, '')));
    v_rotulo  text;
    v_limite  numeric;
    e         jsonb;
    v_lote_id bigint;
    v_amo_id  bigint;
    v_sinal   text;
    v_valor   numeric;
    v_rotulo_alvo text;
    v_atual   contagens;
    v_saida   jsonb := '[]'::jsonb;
    v_alarmes text[] := '{}';
    v_corr    text[] := '{}';
    v_linhas  text[] := '{}';
    v_fmt     text;
    v_n       int := 0;
BEGIN
    PERFORM recebimento_exigir_permissao(p_quem);
    IF v_an NOT IN ('CT', 'BL72', 'BL120') THEN
        RAISE EXCEPTION 'Análise inválida: use CT, BL72 ou BL120.';
    END IF;
    v_rotulo := CASE v_an WHEN 'CT' THEN 'C.T 48h' WHEN 'BL72' THEN 'B.L 72h' ELSE 'B.L 120h' END;
    v_limite := CASE v_an WHEN 'CT' THEN 200 ELSE 50 END;
    IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
        RAISE EXCEPTION 'Diga o que lançar: pelo menos um lote ou amostra.';
    END IF;
    IF jsonb_array_length(p_itens) > 200 THEN
        RAISE EXCEPTION 'Máximo de 200 resultados por vez.';
    END IF;

    FOR e IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
        v_lote_id := NULLIF(e ->> 'recebimento_lote_id', '')::bigint;
        v_amo_id := NULLIF(e ->> 'embarque_amostra_id', '')::bigint;
        v_sinal := COALESCE(NULLIF(e ->> 'sinal', ''), '=');
        v_valor := (e ->> 'valor')::numeric;
        IF num_nonnulls(v_lote_id, v_amo_id) <> 1 THEN
            RAISE EXCEPTION 'Cada resultado é de um lote do recebimento OU de uma amostra do embarque.';
        END IF;
        IF v_sinal NOT IN ('<', '=', '>') THEN
            RAISE EXCEPTION 'Sinal inválido: use <, = ou >.';
        END IF;
        IF v_valor IS NULL OR v_valor < 0 THEN
            RAISE EXCEPTION 'Valor inválido.';
        END IF;
        IF v_lote_id IS NOT NULL THEN
            SELECT 'load ' || l.numero || ' lote ' || r.lote INTO v_rotulo_alvo
            FROM recebimento_lotes r JOIN loads l ON l.id = r.load_id WHERE r.id = v_lote_id;
        ELSE
            SELECT n.nome || ' ' || n.viagem || ' L' || em.linha || ' F' || em.fase || ' amostra A' || ea.numero INTO v_rotulo_alvo
            FROM embarque_amostras ea JOIN embarques em ON em.id = ea.embarque_id JOIN navios n ON n.id = em.navio_id WHERE ea.id = v_amo_id;
        END IF;
        IF v_rotulo_alvo IS NULL THEN
            RAISE EXCEPTION '% não encontrado.', CASE WHEN v_lote_id IS NOT NULL THEN 'Lote ' || v_lote_id ELSE 'Amostra ' || v_amo_id END;
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_saida) s
                   WHERE (s ->> 'recebimento_lote_id')::bigint IS NOT DISTINCT FROM v_lote_id
                     AND (s ->> 'embarque_amostra_id')::bigint IS NOT DISTINCT FROM v_amo_id) THEN
            RAISE EXCEPTION 'O % apareceu duas vezes.', v_rotulo_alvo;
        END IF;

        SELECT * INTO v_atual FROM contagens c
        WHERE c.analise = v_an AND (c.recebimento_lote_id = v_lote_id OR c.embarque_amostra_id = v_amo_id) FOR UPDATE;
        v_fmt := CASE WHEN v_sinal = '=' THEN '' ELSE v_sinal END || replace(trim_scale(v_valor)::text, '.', ',');
        v_linhas := v_linhas || (v_rotulo_alvo || ' = ' || v_fmt);
        IF v_sinal <> '<' AND v_valor >= v_limite THEN
            v_alarmes := v_alarmes || (v_rotulo_alvo || ' = ' || v_fmt);
        END IF;
        IF v_atual.id IS NOT NULL AND (v_atual.sinal IS DISTINCT FROM v_sinal OR v_atual.valor IS DISTINCT FROM v_valor) THEN
            v_corr := v_corr || (v_rotulo_alvo || ' (era ' || CASE WHEN v_atual.sinal = '=' THEN '' ELSE v_atual.sinal END
                                 || replace(trim_scale(v_atual.valor)::text, '.', ',') || ')');
        END IF;
        v_saida := v_saida || jsonb_build_object('recebimento_lote_id', v_lote_id, 'embarque_amostra_id', v_amo_id, 'alvo', v_rotulo_alvo,
            'sinal', v_sinal, 'valor', v_valor, 'resultado', v_fmt, 'alarme', v_sinal <> '<' AND v_valor >= v_limite,
            'era', CASE WHEN v_atual.id IS NULL THEN NULL ELSE CASE WHEN v_atual.sinal = '=' THEN '' ELSE v_atual.sinal END || trim_scale(v_atual.valor)::text END);

        IF NOT p_previa THEN
            IF v_atual.id IS NULL THEN
                INSERT INTO contagens (analise, recebimento_lote_id, embarque_amostra_id, sinal, valor, lido_por)
                VALUES (v_an, v_lote_id, v_amo_id, v_sinal, v_valor, p_quem);
            ELSIF v_atual.sinal IS DISTINCT FROM v_sinal OR v_atual.valor IS DISTINCT FROM v_valor THEN
                UPDATE contagens SET sinal = v_sinal, valor = v_valor, lido_por = p_quem, lido_em = now() WHERE id = v_atual.id;
                INSERT INTO historico_alteracoes (tipo, tabela, registro_id, antes, depois, motivo, quem)
                VALUES ('corrigido', 'contagens', v_atual.id,
                        jsonb_build_object('analise', v_an, 'sinal', v_atual.sinal, 'valor', v_atual.valor),
                        jsonb_build_object('analise', v_an, 'sinal', v_sinal, 'valor', v_valor),
                        'resultado lançado de novo', p_quem);
            END IF;
            v_n := v_n + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'analise', v_an, 'gravados', v_n, 'itens', v_saida,
        'alarmes', cardinality(v_alarmes), 'correcoes', cardinality(v_corr),
        'texto', v_rotulo || ':' || E'\n' || array_to_string(v_linhas, E'\n')
            || CASE WHEN cardinality(v_alarmes) > 0
                    THEN E'\n🚨 Acima do limite (' || CASE WHEN v_an = 'CT' THEN 'C.T' ELSE 'B.L' END || ' ≥ ' || v_limite || '): ' || array_to_string(v_alarmes, ', ')
                    ELSE '' END
            || CASE WHEN cardinality(v_corr) > 0 THEN E'\n⚠️ Corrige resultado anterior: ' || array_to_string(v_corr, ', ') ELSE '' END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION registrar_recebimento(bigint, text, text, text, int[], date, boolean, boolean),
                       lancar_contagem(bigint, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lista_compacta(int[]),
                          registrar_recebimento(bigint, text, text, text, int[], date, boolean, boolean),
                          lancar_contagem(bigint, text, jsonb, boolean) TO labflow_app;

COMMIT;
