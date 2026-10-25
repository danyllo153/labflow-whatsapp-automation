-- 102 — embarque de FCOJ com vários loads e itens na mesma linha e fase (pedido PB19 do app)
--
-- Pedido do Danyllo de 25/10/2026: a linha + fase é a "receita" embarcada e pode juntar loads e itens. As amostras (A1, A2...)
-- ficam no load PRINCIPAL (o primeiro); os outros loads ficam registrados na linha e fase, para rastreio e laudo.
-- Depende da 045. Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 102_embarque_varios_loads.sql
-- Desfazer: 102_embarque_varios_loads_desfazer.sql (publique antes o workflow anterior).
--
--   embarque_loads (embarque_id, load_id, principal): os loads de cada linha e fase; um principal só. Os embarques que já
--     existem entram com os loads das suas amostras (principal = o load da menor amostra).
--   registrar_embarque (a mesma do bot e do app; assinatura igual): load "43783/43784" e item "2503/1233" (um item por
--     load, na mesma ordem; um item só vale para todos). Load novo entra sem fábrica, com aviso. O retorno ganha
--     outros_loads e loads_novos.

BEGIN;

CREATE TABLE embarque_loads (
    embarque_id bigint NOT NULL REFERENCES embarques (id) ON DELETE CASCADE,
    load_id     bigint NOT NULL REFERENCES loads (id),
    principal   boolean NOT NULL DEFAULT false,
    criado_por  bigint REFERENCES usuarios (id),
    criado_em   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (embarque_id, load_id)
);
CREATE UNIQUE INDEX embarque_loads_um_principal ON embarque_loads (embarque_id) WHERE principal;

INSERT INTO embarque_loads (embarque_id, load_id, principal, criado_por, criado_em)
SELECT DISTINCT ON (ea.embarque_id, ea.load_id) ea.embarque_id, ea.load_id,
       ea.load_id = (SELECT ea2.load_id FROM embarque_amostras ea2 WHERE ea2.embarque_id = ea.embarque_id ORDER BY ea2.numero LIMIT 1),
       ea.registrado_por, ea.registrado_em
FROM embarque_amostras ea
ORDER BY ea.embarque_id, ea.load_id, ea.numero;

GRANT SELECT ON embarque_loads TO labflow_app_web, labflow_leitura;

CREATE OR REPLACE FUNCTION registrar_embarque(p_quem bigint, p_navio text, p_linha int, p_fase int, p_load text, p_item text,
                                              p_amostras int[], p_data date, p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_navio  text := upper(trim(COALESCE(p_navio, '')));
    v_nome   text;
    v_viagem text;
    -- "43783/43784": vários loads na mesma linha e fase (o primeiro é o principal, dono das amostras); "2503/1233": um item
    -- por load, na mesma ordem (um item só vale para todos)
    v_loads  text[] := ARRAY(SELECT trim(x) FROM unnest(string_to_array(COALESCE(p_load, ''), '/')) x WHERE trim(x) <> '');
    v_itens  text[] := ARRAY(SELECT trim(x) FROM unnest(string_to_array(COALESCE(p_item, ''), '/')) x WHERE trim(x) <> '');
    v_load   text;
    v_item   text;
    v_k      int;
    v_lx     bigint;
    v_extras text := '';
    v_novos  text[] := '{}';
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
    IF cardinality(v_loads) = 0 OR cardinality(v_itens) = 0
       OR EXISTS (SELECT 1 FROM unnest(v_loads || v_itens) x WHERE x !~ '^[A-Za-z0-9]+$') THEN
        RAISE EXCEPTION 'Load e item são só letras e números (ex.: load 77010 item 444, ou load 43783/43784 item 2503/1233).';
    END IF;
    IF cardinality(v_itens) > 1 AND cardinality(v_itens) <> cardinality(v_loads) THEN
        RAISE EXCEPTION 'Diga um item por load, na mesma ordem (ex.: load 43783/43784 item 2503/1233), ou um item só para todos.';
    END IF;
    IF cardinality(v_loads) > 10 OR (SELECT count(DISTINCT x) FROM unnest(v_loads) x) <> cardinality(v_loads) THEN
        RAISE EXCEPTION 'Diga cada load uma vez só (até 10 na mesma linha e fase).';
    END IF;
    v_load := v_loads[1];
    v_item := v_itens[1];
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
    -- os outros loads da linha e fase (a "receita" embarcada): ficam em embarque_loads; as amostras são do principal
    FOR v_k IN 2 .. cardinality(v_loads) LOOP
        v_extras := v_extras || CASE WHEN v_extras = '' THEN '' ELSE ', ' END || v_loads[v_k] || ' (item ' || v_itens[LEAST(v_k, cardinality(v_itens))] || ')';
        IF NOT EXISTS (SELECT 1 FROM loads l JOIN itens i ON i.id = l.item_id WHERE l.numero = v_loads[v_k] AND i.codigo = v_itens[LEAST(v_k, cardinality(v_itens))]) THEN
            v_novos := v_novos || v_loads[v_k];
        END IF;
    END LOOP;
    IF v_extras <> '' THEN
        v_texto := v_texto || ' Na mesma linha e fase também: ' || v_extras || '; as amostras ficam no load ' || v_load || ' (principal).'
            || CASE WHEN cardinality(v_novos) > 0 THEN ' Não cadastrados, entram agora sem fábrica: ' || array_to_string(v_novos, ', ') || '.' ELSE '' END;
    END IF;
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
    IF NOT p_previa AND v_em IS NOT NULL AND v_ld IS NOT NULL THEN
        -- o principal é o primeiro load que a linha e fase recebeu; os outros entram como parte da receita
        INSERT INTO embarque_loads (embarque_id, load_id, principal, criado_por)
        VALUES (v_em, v_ld, NOT EXISTS (SELECT 1 FROM embarque_loads WHERE embarque_id = v_em AND principal), p_quem)
        ON CONFLICT (embarque_id, load_id) DO NOTHING;
        FOR v_k IN 2 .. cardinality(v_loads) LOOP
            v_item := v_itens[LEAST(v_k, cardinality(v_itens))];
            SELECT l.id INTO v_lx FROM loads l JOIN itens i ON i.id = l.item_id WHERE l.numero = v_loads[v_k] AND i.codigo = v_item;
            IF v_lx IS NULL THEN
                INSERT INTO itens (codigo) VALUES (v_item) ON CONFLICT (codigo) DO UPDATE SET codigo = EXCLUDED.codigo RETURNING id INTO v_it;
                INSERT INTO loads (numero, item_id, criado_por) VALUES (v_loads[v_k], v_it, p_quem) RETURNING id INTO v_lx;
            END IF;
            INSERT INTO embarque_loads (embarque_id, load_id, principal, criado_por) VALUES (v_em, v_lx, false, p_quem)
            ON CONFLICT (embarque_id, load_id) DO NOTHING;
        END LOOP;
    END IF;
    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'novas', COALESCE(to_jsonb(v_novas), '[]'::jsonb), 'existentes', v_exist,
        'load_novo', v_novo AND v_novas IS NOT NULL, 'outros_itens', v_outros, 'outros_loads', to_jsonb(v_loads[2:]),
        'loads_novos', to_jsonb(v_novos), 'texto', v_texto);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMIT;
