-- Desfaz a 102: a registrar_embarque volta a ser a da 045 (um load e um item) e a tabela embarque_loads sai. Backup antes.
-- Publique antes o workflow anterior. Os loads extras que entraram ficam cadastrados (sem amostras).
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 102_embarque_varios_loads_desfazer.sql

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

DROP TABLE IF EXISTS embarque_loads;

COMMIT;
