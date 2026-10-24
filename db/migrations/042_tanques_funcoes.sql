-- 042 — tanques por funções do banco: coleta, análise, leitura e placas (pedido PB14 da sessão do app, Fase E)
--
-- Depende da 016 (placas e limites), da 028 (coletado_por) e da 035 (cargo Analista). Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 042_tanques_funcoes.sql
-- Desfazer: 042_tanques_funcoes_desfazer.sql (publique antes o workflow que ainda não chama estas funções).
--
-- Regra da Fase E: o bot e o app chamam a MESMA função (mesmo cargo, mesmas mensagens). Estas repetem o que o bot faz hoje:
--   registrar_coleta(quem, origem, navio, tanques, data, coletado_por DEFAULT NULL, previa DEFAULT false)
--     -> coleta de terra (até 8 tanques, só número) ou de navio (até 16, número e letra), com os drops D5, D10 e D15 e a
--        amostra de arquivo (bag na terra, pote no navio, descarte em 1 ano). Coleta já registrada no mesmo dia: recusa tudo.
--        Admin, Analista e Coletor; o Coletor registra só a própria coleta (sem "coletado por").
--   registrar_analise(quem, navio, tanques, frasco, data, previa DEFAULT false)
--     -> análise normal ou stress: 4 linhas por tanque (C.T Prof. 48 h; B.L Prof. pré 3 e final 5 dias; WORT Prof. e Sup.
--        pré 5 e final 10 dias), na coleta mais recente até a data. Tanque sem coleta: recusa tudo. Admin e Analista.
--        Novo em relação ao bot: a mesma análise (frasco e data) na mesma coleta é recusada, em vez de duplicar.
--   concluir_leitura(quem, itens [{analise_id, etapa pre|final}])
--     -> marca a pré-leitura ou a leitura final como feita (sem placas), como o "sim" das leituras de hoje. Admin e Analista.
--   lancar_placas(quem, itens [{analise_id, etapa, placas: [{placa 1-3, sinal, valor}]}], previa DEFAULT false)
--     -> grava as 3 placas (repetir corrige) e marca a leitura como feita; devolve o que deu não ok pelo limite em vigor
--        (placa ">" ou acima do limite), para o app perguntar do desvio (abrir o desvio é o PB17). Admin e Analista.
-- Todas devolvem jsonb {ok: true, ..., texto}; erro de regra sai como exceção em português. As portas de entrada do bot
-- (..._pelo_bot) acham a pessoa pelo telefone e devolvem {ok: false, erro} no lugar da exceção, como a 037 e a 041.
-- SECURITY DEFINER com search_path fixo e dono labflow_app; o GRANT para o papel do app fica numa migration do app.

BEGIN;

CREATE OR REPLACE FUNCTION tanque_exigir_cargo(p_quem bigint, p_cargos text[]) RETURNS text AS $$
DECLARE
    v_cargo text;
BEGIN
    SELECT cargo INTO v_cargo FROM usuarios WHERE id = p_quem;
    IF v_cargo IS NULL THEN
        RAISE EXCEPTION 'Pessoa não encontrada.';
    END IF;
    IF NOT v_cargo = ANY (p_cargos) THEN
        RAISE EXCEPTION 'Seu cargo (%) não pode fazer isso.', v_cargo;
    END IF;
    RETURN v_cargo;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION registrar_coleta(p_quem bigint, p_origem text, p_navio text, p_tanques text[], p_data date,
                                            p_coletado_por text DEFAULT NULL, p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_cargo   text;
    v_origem  text := lower(trim(COALESCE(p_origem, '')));
    v_navio   text := upper(trim(COALESCE(p_navio, '')));
    v_nome    text;
    v_viagem  text;
    v_nav_id  bigint;
    v_tq      text[];
    v_por     text := NULLIF(trim(COALESCE(p_coletado_por, '')), '');
    v_dup     text;
    v_texto   text;
    v_n       int;
BEGIN
    v_cargo := tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista', 'Coletor']);
    IF v_origem NOT IN ('terra', 'navio') THEN
        RAISE EXCEPTION 'Origem inválida: terra ou navio.';
    END IF;
    IF v_cargo = 'Coletor' AND v_por IS NOT NULL THEN
        RAISE EXCEPTION 'Coletor registra só a própria coleta: tire o "coletado por".';
    END IF;
    IF p_data IS NULL THEN
        RAISE EXCEPTION 'Diga a data da coleta.';
    END IF;
    SELECT array_agg(DISTINCT upper(trim(t)) ORDER BY upper(trim(t))) INTO v_tq FROM unnest(p_tanques) t WHERE trim(COALESCE(t, '')) <> '';
    IF v_tq IS NULL THEN
        RAISE EXCEPTION 'Diga os tanques.';
    END IF;
    IF v_origem = 'terra' THEN
        IF EXISTS (SELECT 1 FROM unnest(v_tq) t WHERE t !~ '^\d+$') THEN
            RAISE EXCEPTION 'Tanque de terra é só número (ex.: 42).';
        END IF;
        IF cardinality(v_tq) > 8 THEN
            RAISE EXCEPTION 'Só é possível registrar até 8 tanques de terra por vez (vieram %).', cardinality(v_tq);
        END IF;
    ELSE
        IF v_navio = '' THEN
            RAISE EXCEPTION 'Diga o navio e a viagem (ex.: O.SKY 189).';
        END IF;
        IF EXISTS (SELECT 1 FROM unnest(v_tq) t WHERE t !~ '^\d+[A-Z]?$') THEN
            RAISE EXCEPTION 'Tanque de navio é número e uma letra (ex.: 1C, 2P).';
        END IF;
        IF cardinality(v_tq) > 16 THEN
            RAISE EXCEPTION 'Só é possível registrar até 16 tanques de navio por vez (vieram %).', cardinality(v_tq);
        END IF;
        v_nome := upper(trim(regexp_replace(v_navio, '\s*\d+\s*$', '')));
        v_viagem := COALESCE(substring(v_navio from '(\d+)\s*$'), '');
        SELECT id INTO v_nav_id FROM navios WHERE nome = v_nome AND viagem = v_viagem;
    END IF;

    SELECT string_agg('tanque ' || c.tanque || ' (coletado por ' || COALESCE(c.coletado_por, u.nome, 'desconhecido') || ')', ', ' ORDER BY length(c.tanque), c.tanque)
    INTO v_dup
    FROM coletas c LEFT JOIN usuarios u ON u.id = c.registrado_por
    WHERE c.origem = v_origem AND c.data_coleta = p_data AND c.tanque = ANY (v_tq)
      AND (v_origem = 'terra' OR c.navio_id IS NOT DISTINCT FROM v_nav_id);
    IF v_dup IS NOT NULL THEN
        RAISE EXCEPTION 'Coleta já registrada em %: %.', to_char(p_data, 'DD/MM/YYYY'), v_dup;
    END IF;

    v_n := cardinality(v_tq);
    v_texto := CASE WHEN v_origem = 'terra' THEN 'Tanque' || CASE WHEN v_n > 1 THEN 's' ELSE '' END || ' terra '
                    ELSE 'Navio ' || v_navio || ', tanque' || CASE WHEN v_n > 1 THEN 's' ELSE '' END || ' ' END
        || (SELECT string_agg(t, ', ' ORDER BY length(t), t) FROM unnest(v_tq) t)
        || ', coleta de ' || to_char(p_data, 'DD/MM/YYYY') || COALESCE(' (coletado por ' || v_por || ')', '')
        || ': ' || v_n || ' coleta' || CASE WHEN v_n > 1 THEN 's' ELSE '' END
        || ', drops D5 ' || to_char(p_data + 5, 'DD/MM') || ', D10 ' || to_char(p_data + 10, 'DD/MM') || ' e D15 ' || to_char(p_data + 15, 'DD/MM')
        || ' e ' || CASE WHEN v_origem = 'terra' THEN 'bag' ELSE 'pote' END || CASE WHEN v_n > 1 THEN 's' ELSE '' END
        || ' no arquivo até ' || to_char(p_data + 365, 'DD/MM/YYYY') || '.';
    IF p_previa THEN
        RETURN jsonb_build_object('ok', true, 'previa', true, 'tanques', to_jsonb(v_tq), 'texto', v_texto);
    END IF;

    IF v_origem = 'navio' AND v_nav_id IS NULL THEN
        INSERT INTO navios (nome, viagem) VALUES (v_nome, v_viagem)
        ON CONFLICT (nome, viagem) DO UPDATE SET nome = EXCLUDED.nome RETURNING id INTO v_nav_id;
    END IF;
    WITH novas AS (
        INSERT INTO coletas (origem, navio_id, tanque, data_coleta, registrado_por, coletado_por)
        SELECT v_origem, v_nav_id, t, p_data, p_quem, v_por FROM unnest(v_tq) t
        RETURNING id, data_coleta
    ), d AS (
        INSERT INTO drops (coleta_id, dia, data_prevista)
        SELECT n.id, x.dia, n.data_coleta + x.dia FROM novas n CROSS JOIN (VALUES (5), (10), (15)) AS x(dia)
    )
    INSERT INTO arquivo_amostras (coleta_id, tipo, data_descarte)
    SELECT id, CASE WHEN v_origem = 'terra' THEN 'bag' ELSE 'pote' END, data_coleta + 365 FROM novas;
    RETURN jsonb_build_object('ok', true, 'previa', false, 'tanques', to_jsonb(v_tq), 'coletas', v_n, 'drops', 3 * v_n,
                              'arquivos', v_n, 'texto', v_texto);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION registrar_analise(p_quem bigint, p_navio text, p_tanques text[], p_frasco text, p_data date,
                                             p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_navio   text := NULLIF(upper(trim(COALESCE(p_navio, ''))), '');
    v_frasco  text := initcap(lower(trim(COALESCE(p_frasco, ''))));
    v_tq      text[];
    v_falta   text;
    v_dup     text;
    v_n       int;
    v_texto   text;
    v_alvo    jsonb;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF v_frasco NOT IN ('Normal', 'Stress') THEN
        RAISE EXCEPTION 'Frasco inválido: normal ou stress.';
    END IF;
    IF p_data IS NULL THEN
        RAISE EXCEPTION 'Diga a data da análise.';
    END IF;
    SELECT array_agg(DISTINCT upper(trim(t)) ORDER BY upper(trim(t))) INTO v_tq FROM unnest(p_tanques) t WHERE trim(COALESCE(t, '')) <> '';
    IF v_tq IS NULL THEN
        RAISE EXCEPTION 'Diga os tanques.';
    END IF;
    IF cardinality(v_tq) > (CASE WHEN v_navio IS NULL THEN 8 ELSE 16 END) THEN
        RAISE EXCEPTION 'Só é possível registrar até % tanques por vez%.', CASE WHEN v_navio IS NULL THEN 8 ELSE 16 END,
            CASE WHEN v_navio IS NULL THEN '' ELSE ' de navio' END;
    END IF;

    SELECT jsonb_agg(jsonb_build_object('tanque', t, 'coleta_id',
               (SELECT c.id FROM coletas c LEFT JOIN navios n ON n.id = c.navio_id
                WHERE c.tanque = t AND c.origem = CASE WHEN v_navio IS NULL THEN 'terra' ELSE 'navio' END
                  AND (v_navio IS NULL OR upper(trim(n.nome || ' ' || n.viagem)) = v_navio)
                  AND c.data_coleta <= p_data
                ORDER BY c.data_coleta DESC, c.id DESC LIMIT 1)))
    INTO v_alvo FROM unnest(v_tq) t;
    SELECT string_agg(tanque, ', ' ORDER BY length(tanque), tanque) INTO v_falta FROM jsonb_to_recordset(v_alvo) AS x(tanque text, coleta_id bigint) WHERE coleta_id IS NULL;
    IF v_falta IS NOT NULL THEN
        RAISE EXCEPTION 'Não há coleta % até % para o(s) tanque(s) %. Registre a coleta primeiro.',
            CASE WHEN v_navio IS NULL THEN 'de terra' ELSE 'do navio ' || v_navio END, to_char(p_data, 'DD/MM/YYYY'), v_falta;
    END IF;
    SELECT string_agg(DISTINCT x.tanque, ', ') INTO v_dup
    FROM jsonb_to_recordset(v_alvo) AS x(tanque text, coleta_id bigint) JOIN analises a ON a.coleta_id = x.coleta_id
    WHERE a.frasco = v_frasco AND a.data_analise = p_data AND a.repeticao_de IS NULL;
    IF v_dup IS NOT NULL THEN
        RAISE EXCEPTION 'O(s) tanque(s) % já têm a análise % de %.', v_dup, lower(v_frasco), to_char(p_data, 'DD/MM/YYYY');
    END IF;

    v_n := cardinality(v_tq);
    v_texto := 'Análise ' || lower(v_frasco) || ' de ' || to_char(p_data, 'DD/MM/YYYY') || CASE WHEN v_navio IS NULL THEN ', tanque'
               ELSE ', navio ' || v_navio || ', tanque' END || CASE WHEN v_n > 1 THEN 's ' ELSE ' ' END
        || (SELECT string_agg(t, ', ' ORDER BY length(t), t) FROM unnest(v_tq) t)
        || ': C.T (leitura ' || to_char(p_data + 2, 'DD/MM') || '), B.L (pré ' || to_char(p_data + 3, 'DD/MM') || ', final ' || to_char(p_data + 5, 'DD/MM')
        || ') e WORT prof. e sup. (pré ' || to_char(p_data + 5, 'DD/MM') || ', final ' || to_char(p_data + 10, 'DD/MM') || '), '
        || 4 * v_n || ' análises.';
    IF p_previa THEN
        RETURN jsonb_build_object('ok', true, 'previa', true, 'tanques', to_jsonb(v_tq), 'texto', v_texto);
    END IF;

    INSERT INTO analises (coleta_id, frasco, sub_analise, metodo, data_analise, pre_leitura_prevista, leitura_final_prevista,
                          status, registrado_por)
    SELECT x.coleta_id, v_frasco, l.sub, l.met, p_data,
           CASE WHEN l.pre IS NULL THEN NULL ELSE p_data + l.pre END, p_data + l.fin,
           CASE WHEN l.pre IS NULL THEN 'Aguardando Leitura Final' ELSE 'Aguardando Pré-Leitura' END, p_quem
    FROM jsonb_to_recordset(v_alvo) AS x(tanque text, coleta_id bigint)
    CROSS JOIN (VALUES ('CT', 'Profundidade', NULL::int, 2), ('BL', 'Profundidade', 3, 5),
                       ('WORT', 'Profundidade', 5, 10), ('WORT', 'Superficie', 5, 10)) AS l(sub, met, pre, fin);
    RETURN jsonb_build_object('ok', true, 'previa', false, 'tanques', to_jsonb(v_tq), 'gravadas', 4 * v_n, 'texto', v_texto);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION concluir_leitura(p_quem bigint, p_itens jsonb) RETURNS jsonb AS $$
DECLARE
    v_n int;
    v_total int;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
        RAISE EXCEPTION 'Diga as leituras.';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_itens) e WHERE COALESCE(e ->> 'etapa', '') NOT IN ('pre', 'final')) THEN
        RAISE EXCEPTION 'Etapa inválida: pre ou final.';
    END IF;
    v_total := jsonb_array_length(p_itens);
    WITH x AS (SELECT (e ->> 'analise_id')::bigint AS id, e ->> 'etapa' AS etapa FROM jsonb_array_elements(p_itens) e),
    u AS (
        UPDATE analises a
        SET status = CASE WHEN x.etapa = 'pre' THEN 'Aguardando Leitura Final' ELSE 'Concluído' END,
            pre_leitura_por = CASE WHEN x.etapa = 'pre' THEN p_quem ELSE a.pre_leitura_por END,
            leitura_final_por = CASE WHEN x.etapa = 'final' THEN p_quem ELSE a.leitura_final_por END
        FROM x
        WHERE a.id = x.id
          AND ((x.etapa = 'pre' AND a.status = 'Aguardando Pré-Leitura') OR (x.etapa = 'final' AND a.status = 'Aguardando Leitura Final'))
        RETURNING a.id
    )
    SELECT count(*) INTO v_n FROM u;
    RETURN jsonb_build_object('ok', true, 'concluidas', v_n, 'ignoradas', v_total - v_n,
        'texto', v_n || ' leitura' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' marcada' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' como feita'
              || CASE WHEN v_n = 1 THEN '' ELSE 's' END || '.'
              || CASE WHEN v_total > v_n THEN ' ' || (v_total - v_n) || ' já estava' || CASE WHEN v_total - v_n = 1 THEN '' ELSE 'm' END || ' feita' || CASE WHEN v_total - v_n = 1 THEN '' ELSE 's' END || ' (ou fora de ordem) e ficou como estava.' ELSE '' END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION lancar_placas(p_quem bigint, p_itens jsonb, p_previa boolean DEFAULT false) RETURNS jsonb AS $$
DECLARE
    e        jsonb;
    pl       jsonb;
    v_a      analises;
    v_et     text;
    v_lim    numeric;
    v_alvo   text;
    v_naook  boolean;
    v_saida  jsonb := '[]'::jsonb;
    v_linhas text[] := '{}';
    v_nao    text[] := '{}';
    v_placas text;
    v_np     int := 0;
    v_nl     int := 0;
    v_rows   int;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
        RAISE EXCEPTION 'Diga as leituras com as placas.';
    END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
        v_et := e ->> 'etapa';
        IF v_et NOT IN ('pre', 'final') THEN
            RAISE EXCEPTION 'Etapa inválida: pre ou final.';
        END IF;
        SELECT * INTO v_a FROM analises WHERE id = (e ->> 'analise_id')::bigint FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Leitura % não encontrada.', e ->> 'analise_id';
        END IF;
        IF v_et = 'pre' AND v_a.pre_leitura_prevista IS NULL THEN
            RAISE EXCEPTION 'O C.T não tem pré-leitura.';
        END IF;
        IF jsonb_typeof(e -> 'placas') <> 'array' OR jsonb_array_length(e -> 'placas') <> 3
           OR (SELECT count(DISTINCT (x ->> 'placa')::int) FROM jsonb_array_elements(e -> 'placas') x WHERE (x ->> 'placa')::int BETWEEN 1 AND 3) <> 3 THEN
            RAISE EXCEPTION 'Cada leitura tem as 3 placas (1, 2 e 3).';
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(e -> 'placas') x
                   WHERE COALESCE(x ->> 'sinal', '=') NOT IN ('<', '=', '>') OR x ->> 'valor' IS NULL OR (x ->> 'valor')::numeric < 0
                      OR (COALESCE(x ->> 'sinal', '=') = '<' AND (x ->> 'valor')::numeric <> 1)) THEN
            RAISE EXCEPTION 'Placa inválida: use <1, um número ou >N.';
        END IF;
        SELECT l.limite_max INTO v_lim FROM limites_nfc l
        WHERE l.sub_analise = v_a.sub_analise AND l.metodo = v_a.metodo AND l.etapa = v_et
          AND l.vigente_de <= v_a.data_analise AND (l.vigente_ate IS NULL OR l.vigente_ate >= v_a.data_analise)
        ORDER BY l.vigente_de DESC LIMIT 1;
        SELECT CASE WHEN c.origem = 'terra' THEN 'tanque ' || c.tanque ELSE n.nome || ' ' || n.viagem || ' tanque ' || c.tanque END
            || ' ' || lower(v_a.frasco) || ' ' || v_a.sub_analise || CASE WHEN v_a.sub_analise = 'WORT' THEN ' ' || lower(left(v_a.metodo, 4)) ELSE '' END
            || CASE WHEN v_et = 'pre' THEN ' (pré)' ELSE '' END
        INTO v_alvo FROM coletas c LEFT JOIN navios n ON n.id = c.navio_id WHERE c.id = v_a.coleta_id;
        SELECT string_agg(CASE WHEN COALESCE(x ->> 'sinal', '=') = '=' THEN '' ELSE x ->> 'sinal' END || trim_scale((x ->> 'valor')::numeric)::text, ',' ORDER BY (x ->> 'placa')::int),
               bool_or(x ->> 'sinal' = '>' OR (COALESCE(x ->> 'sinal', '=') = '=' AND v_lim IS NOT NULL AND (x ->> 'valor')::numeric > v_lim))
        INTO v_placas, v_naook FROM jsonb_array_elements(e -> 'placas') x;
        v_linhas := v_linhas || (v_alvo || ' = ' || v_placas);
        IF v_naook THEN
            v_nao := v_nao || (v_alvo || ' = ' || v_placas || ' (limite ' || trim_scale(v_lim) || ')');
        END IF;
        v_saida := v_saida || jsonb_build_object('analise_id', v_a.id, 'etapa', v_et, 'alvo', v_alvo, 'placas', v_placas,
            'limite', v_lim, 'nao_ok', COALESCE(v_naook, false), 'tem_desvio', EXISTS (SELECT 1 FROM desvios_tanque d WHERE d.analise_id = v_a.id));
        IF NOT p_previa THEN
            FOR pl IN SELECT * FROM jsonb_array_elements(e -> 'placas') LOOP
                INSERT INTO leituras_placas (analise_id, etapa, placa, sinal, valor, origem, lido_por)
                VALUES (v_a.id, v_et, (pl ->> 'placa')::smallint, COALESCE(NULLIF(pl ->> 'sinal', ''), '='), (pl ->> 'valor')::numeric, 'digitado', p_quem)
                ON CONFLICT (analise_id, etapa, placa) DO UPDATE
                  SET sinal = EXCLUDED.sinal, valor = EXCLUDED.valor, origem = 'digitado', lido_por = EXCLUDED.lido_por, lido_em = now();
                v_np := v_np + 1;
            END LOOP;
            UPDATE analises a
            SET status = CASE WHEN v_et = 'pre' THEN 'Aguardando Leitura Final' ELSE 'Concluído' END,
                pre_leitura_por = CASE WHEN v_et = 'pre' THEN p_quem ELSE a.pre_leitura_por END,
                leitura_final_por = CASE WHEN v_et = 'final' THEN p_quem ELSE a.leitura_final_por END
            WHERE a.id = v_a.id AND ((v_et = 'pre' AND a.status = 'Aguardando Pré-Leitura') OR (v_et = 'final' AND a.status <> 'Concluído'));
            GET DIAGNOSTICS v_rows = ROW_COUNT;
            v_nl := v_nl + v_rows;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'placas', v_np, 'leituras', v_nl, 'itens', v_saida,
        'nao_ok', cardinality(v_nao),
        'texto', 'Placas:' || E'\n' || array_to_string(v_linhas, E'\n')
            || CASE WHEN cardinality(v_nao) > 0 THEN E'\n🚨 Não ok: ' || array_to_string(v_nao, '; ') ELSE '' END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- portas de entrada do bot -------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bot_quem(p_telefone text) RETURNS bigint AS $$
DECLARE
    v bigint;
BEGIN
    SELECT id INTO v FROM usuarios WHERE telefone = p_telefone;
    IF v IS NULL THEN
        RAISE EXCEPTION 'Número não cadastrado.';
    END IF;
    RETURN v;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION coleta_registrar_pelo_bot(p_telefone text, p_origem text, p_navio text, p_tanques jsonb, p_data text,
                                                     p_coletado_por text) RETURNS jsonb AS $$
BEGIN
    RETURN registrar_coleta(bot_quem(p_telefone), p_origem, p_navio,
                            ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_tanques, '[]'::jsonb))), to_date(p_data, 'DD/MM/YYYY'), p_coletado_por);
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN jsonb_build_object('ok', false, 'erro', 'Data inválida.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION analise_registrar_pelo_bot(p_telefone text, p_navio text, p_tanques jsonb, p_frasco text, p_data text)
RETURNS jsonb AS $$
BEGIN
    RETURN registrar_analise(bot_quem(p_telefone), p_navio,
                             ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_tanques, '[]'::jsonb))), p_frasco, to_date(p_data, 'DD/MM/YYYY'));
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN jsonb_build_object('ok', false, 'erro', 'Data inválida.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- itens do "sim" das leituras de hoje: [{id, novoStatus}] (novoStatus "Concluído" = leitura final; senão, pré-leitura)
CREATE OR REPLACE FUNCTION leitura_concluir_pelo_bot(p_telefone text, p_itens jsonb) RETURNS jsonb AS $$
BEGIN
    IF COALESCE(jsonb_array_length(p_itens), 0) = 0 THEN
        RETURN jsonb_build_object('ok', true, 'concluidas', 0);
    END IF;
    RETURN concluir_leitura(bot_quem(p_telefone),
        (SELECT jsonb_agg(jsonb_build_object('analise_id', (e ->> 'id')::bigint,
                                             'etapa', CASE WHEN e ->> 'novoStatus' = 'Concluído' THEN 'final' ELSE 'pre' END))
         FROM jsonb_array_elements(p_itens) e));
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- itens das placas: [{analise_id, etapa, placas: [{placa, sinal, valor}]}] (o comando de placas manda um item só)
CREATE OR REPLACE FUNCTION placas_lancar_pelo_bot(p_telefone text, p_itens jsonb) RETURNS jsonb AS $$
BEGIN
    RETURN lancar_placas(bot_quem(p_telefone), p_itens);
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok', false, 'erro', 'Placa inválida.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION tanque_exigir_cargo(bigint, text[]),
                       registrar_coleta(bigint, text, text, text[], date, text, boolean),
                       registrar_analise(bigint, text, text[], text, date, boolean),
                       concluir_leitura(bigint, jsonb), lancar_placas(bigint, jsonb, boolean),
                       bot_quem(text), coleta_registrar_pelo_bot(text, text, text, jsonb, text, text),
                       analise_registrar_pelo_bot(text, text, jsonb, text, text), leitura_concluir_pelo_bot(text, jsonb),
                       placas_lancar_pelo_bot(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tanque_exigir_cargo(bigint, text[]),
                          registrar_coleta(bigint, text, text, text[], date, text, boolean),
                          registrar_analise(bigint, text, text[], text, date, boolean),
                          concluir_leitura(bigint, jsonb), lancar_placas(bigint, jsonb, boolean),
                          bot_quem(text), coleta_registrar_pelo_bot(text, text, text, jsonb, text, text),
                          analise_registrar_pelo_bot(text, text, jsonb, text, text), leitura_concluir_pelo_bot(text, jsonb),
                          placas_lancar_pelo_bot(text, jsonb) TO labflow_app;

COMMIT;
