-- 046 — recebimento de NFC por funções do banco: lotes fresh/past com a diluição e o C.T/B.L multiplicado (pedido PB16, Fase E)
--
-- Depende da 027 (recebimento_nfc, contagens_nfc), da 033 (historico_alteracoes) e da 042 (tanque_exigir_cargo, bot_quem).
-- Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 046_nfc_funcoes.sql
-- Desfazer: 046_nfc_funcoes_desfazer.sql (publique antes o workflow que ainda não chama estas funções).
--
-- Regra da Fase E: o bot e o app chamam a MESMA função. Estas repetem o que o bot faz hoje:
--   registrar_recebimento_nfc(quem, blocos, previa DEFAULT false)
--     -> blocos = [{load, fabrica, item: "129", itens: [{lote, amostra fresh|past, diluicao 0-9, data dd/mm/aaaa,
--        resultados?: [{analise CT|BL72|BL120, sinal, valor}]}]}] (um ou vários loads, como a foto do laudo; até 60 lotes).
--        Load novo entra com a fábrica; load já cadastrado com outra fábrica fica de fora (volta em conflitos) e os outros
--        loads seguem. Repetir lote + tipo corrige a diluição e recalcula os resultados já gravados. Os resultados da linha
--        (como saíram na placa) gravam o lido e o final (lido x 10^diluição).
--   lancar_contagem_nfc(quem, itens [{analise, id (recebimento_nfc), sinal, lido}], previa DEFAULT false)
--     -> C.T/B.L do NFC recebido: grava o lido e o final pela diluição do lote; repetir corrige e, se o valor muda, fica no
--        histórico. Sem alarme (o NFC recebido não usa os limites do concentrado, decisão de 14/10/2026).
-- Admin e Analista. jsonb {ok: true, ...}; erro de regra sai como exceção em português; as portas de entrada do bot
-- devolvem {ok: false, erro}. SECURITY DEFINER com search_path fixo; o GRANT do app fica com o app.

BEGIN;

CREATE OR REPLACE FUNCTION registrar_recebimento_nfc(p_quem bigint, p_blocos jsonb, p_previa boolean DEFAULT false) RETURNS jsonb AS $$
DECLARE
    v_n    int;
    v_res  jsonb;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF p_blocos IS NULL OR jsonb_typeof(p_blocos) <> 'array' OR jsonb_array_length(p_blocos) = 0 THEN
        RAISE EXCEPTION 'Diga o load e os lotes.';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_blocos) b
               WHERE COALESCE(b ->> 'item', '') <> '129' OR upper(COALESCE(b ->> 'fabrica', '')) NOT IN ('AQA', 'CON', 'COL', 'UCH', 'ITA', 'TMG')
                  OR COALESCE(b ->> 'load', '') !~ '^[A-Za-z0-9]+$' OR jsonb_typeof(b -> 'itens') <> 'array') THEN
        RAISE EXCEPTION 'Recebimento NFC é do item 129, com load e uma das fábricas AQA, CON, COL, UCH, ITA ou TMG.';
    END IF;
    SELECT count(*) INTO v_n FROM jsonb_array_elements(p_blocos) b, jsonb_array_elements(b -> 'itens') x;
    IF v_n = 0 OR v_n > 60 THEN
        RAISE EXCEPTION 'De 1 a 60 lotes por vez.';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_blocos) b, jsonb_array_elements(b -> 'itens') x
               WHERE COALESCE(x ->> 'amostra', '') NOT IN ('fresh', 'past') OR (x ->> 'lote')::int < 1
                  OR (x ->> 'diluicao')::int NOT BETWEEN 0 AND 9 OR to_date(x ->> 'data', 'DD/MM/YYYY') IS NULL) THEN
        RAISE EXCEPTION 'Cada lote tem número, fresh ou past, a diluição (10 elevado a 0 até 9) e a data.';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_blocos) b, jsonb_array_elements(b -> 'itens') x,
                             jsonb_array_elements(COALESCE(x -> 'resultados', '[]'::jsonb)) r
               WHERE COALESCE(r ->> 'analise', '') NOT IN ('CT', 'BL72', 'BL120') OR COALESCE(r ->> 'sinal', '=') NOT IN ('<', '=', '>')
                  OR (r ->> 'valor')::numeric < 0 OR r ->> 'valor' IS NULL) THEN
        RAISE EXCEPTION 'Resultado inválido: CT, BL72 ou BL120, com <, = ou >.';
    END IF;

    IF p_previa THEN
        SELECT jsonb_build_object('ok', true, 'previa', true,
            'gravados', COALESCE(jsonb_agg(jsonb_build_object('load', b ->> 'load', 'lote', (x ->> 'lote')::int, 'amostra', x ->> 'amostra',
                 'diluicao', (x ->> 'diluicao')::int, 'novo', r.id IS NULL, 'era', r.diluicao)), '[]'::jsonb),
            'conflitos', (SELECT jsonb_agg(DISTINCT jsonb_build_object('load', l.numero, 'cadastrada', fb.nome))
                          FROM jsonb_array_elements(p_blocos) b2 JOIN loads l ON l.numero = b2 ->> 'load'
                          JOIN itens i ON i.id = l.item_id AND i.codigo = '129' JOIN fabricas fb ON fb.id = l.fabrica_id
                          WHERE fb.nome <> upper(b2 ->> 'fabrica')))
        INTO v_res
        FROM jsonb_array_elements(p_blocos) b CROSS JOIN LATERAL jsonb_array_elements(b -> 'itens') x
        LEFT JOIN loads l ON l.numero = b ->> 'load' AND l.item_id = (SELECT id FROM itens WHERE codigo = '129')
        LEFT JOIN recebimento_nfc r ON r.load_id = l.id AND r.lote = (x ->> 'lote')::int AND r.amostra = x ->> 'amostra';
        RETURN v_res;
    END IF;

    WITH bl AS (
      SELECT x ->> 'load' AS numero, upper(x ->> 'fabrica') AS fab, x ->> 'item' AS item, x -> 'itens' AS itens
      FROM jsonb_array_elements(p_blocos) AS x
    ), f AS (
      INSERT INTO fabricas (nome) SELECT DISTINCT fab FROM bl
      ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
      RETURNING id, nome
    ), i AS (
      INSERT INTO itens (codigo) SELECT DISTINCT item FROM bl
      ON CONFLICT (codigo) DO UPDATE SET codigo = EXCLUDED.codigo
      RETURNING id, codigo
    ), existente AS (
      SELECT l.id, l.numero, l.item_id, l.fabrica_id
      FROM loads l JOIN i ON i.id = l.item_id JOIN bl ON bl.numero = l.numero AND bl.item = i.codigo
    ), novo AS (
      INSERT INTO loads (numero, item_id, fabrica_id, criado_por)
      SELECT bl.numero, i.id, f.id, p_quem
      FROM bl JOIN i ON i.codigo = bl.item JOIN f ON f.nome = bl.fab
      WHERE NOT EXISTS (SELECT 1 FROM existente e WHERE e.numero = bl.numero AND e.item_id = i.id)
      RETURNING id, numero, item_id, fabrica_id
    ), ld AS (
      SELECT id, numero, item_id, fabrica_id FROM existente UNION ALL SELECT id, numero, item_id, fabrica_id FROM novo
    ), alvo AS (
      SELECT ld.id AS load_id, ld.numero, bl.itens, fb.nome AS cadastrada, (ld.fabrica_id <> f.id) AS conflito
      FROM ld JOIN bl ON bl.numero = ld.numero JOIN f ON f.nome = bl.fab JOIN fabricas fb ON fb.id = ld.fabrica_id
    ), antes AS (
      SELECT r.load_id, r.lote, r.amostra, r.diluicao FROM recebimento_nfc r WHERE r.load_id IN (SELECT load_id FROM alvo)
    ), ins AS (
      INSERT INTO recebimento_nfc (load_id, lote, amostra, diluicao, data_recebimento, registrado_por)
      SELECT a.load_id, (x ->> 'lote')::int, x ->> 'amostra', (x ->> 'diluicao')::smallint, to_date(x ->> 'data', 'DD/MM/YYYY'), p_quem
      FROM alvo a, jsonb_array_elements(a.itens) AS x
      WHERE NOT a.conflito
      ON CONFLICT (load_id, lote, amostra) DO UPDATE
        SET diluicao = EXCLUDED.diluicao, data_recebimento = EXCLUDED.data_recebimento,
            registrado_por = EXCLUDED.registrado_por, registrado_em = now()
      RETURNING id, load_id, lote, amostra, diluicao, (xmax = 0) AS novo
    ), pedidos_res AS (
      SELECT ins.id AS recebimento_nfc_id, ins.diluicao, r ->> 'analise' AS analise, COALESCE(r ->> 'sinal', '=') AS sinal,
             (r ->> 'valor')::numeric AS lido
      FROM ins
      JOIN alvo a ON a.load_id = ins.load_id
      CROSS JOIN LATERAL jsonb_array_elements(a.itens) AS x
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(x -> 'resultados', '[]'::jsonb)) AS r
      WHERE (x ->> 'lote')::int = ins.lote AND x ->> 'amostra' = ins.amostra
    ), res AS (
      INSERT INTO contagens_nfc (analise, recebimento_nfc_id, sinal, valor, valor_lido, diluicao, lido_por)
      SELECT p.analise, p.recebimento_nfc_id, p.sinal, trim_scale(p.lido * power(10::numeric, p.diluicao)), p.lido, p.diluicao, p_quem
      FROM pedidos_res p
      ON CONFLICT (analise, recebimento_nfc_id) DO UPDATE
        SET sinal = EXCLUDED.sinal, valor = EXCLUDED.valor, valor_lido = EXCLUDED.valor_lido, diluicao = EXCLUDED.diluicao,
            lido_por = EXCLUDED.lido_por, lido_em = now()
      RETURNING id
    ), reajuste AS (
      UPDATE contagens_nfc c SET diluicao = i.diluicao, valor = trim_scale(c.valor_lido * power(10::numeric, i.diluicao))
      FROM ins i WHERE c.recebimento_nfc_id = i.id AND c.diluicao <> i.diluicao
        AND NOT EXISTS (SELECT 1 FROM pedidos_res p WHERE p.recebimento_nfc_id = c.recebimento_nfc_id AND p.analise = c.analise)
      RETURNING c.id
    )
    SELECT jsonb_build_object('ok', true, 'previa', false,
        'gravados', COALESCE((SELECT jsonb_agg(jsonb_build_object('load', a.numero, 'lote', ins.lote, 'amostra', ins.amostra, 'diluicao', ins.diluicao,
                                              'novo', ins.novo, 'era', ant.diluicao) ORDER BY a.numero, ins.lote, ins.amostra)
                    FROM ins JOIN alvo a ON a.load_id = ins.load_id
                    LEFT JOIN antes ant ON ant.load_id = ins.load_id AND ant.lote = ins.lote AND ant.amostra = ins.amostra), '[]'::jsonb),
        'recalculados', (SELECT count(*) FROM reajuste),
        'resultados_gravados', (SELECT count(*) FROM res),
        'conflitos', (SELECT jsonb_agg(jsonb_build_object('load', numero, 'cadastrada', cadastrada)) FROM alvo WHERE conflito))
    INTO v_res;
    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION lancar_contagem_nfc(p_quem bigint, p_itens jsonb, p_previa boolean DEFAULT false) RETURNS jsonb AS $$
DECLARE
    e      jsonb;
    v_r    recebimento_nfc;
    v_at   contagens_nfc;
    v_an   text;
    v_sin  text;
    v_lido numeric;
    v_fin  numeric;
    v_n    int := 0;
    v_corr int := 0;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
        RAISE EXCEPTION 'Diga o que lançar: pelo menos um lote.';
    END IF;
    IF jsonb_array_length(p_itens) > 120 THEN
        RAISE EXCEPTION 'Máximo de 120 resultados por vez.';
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(p_itens) x) <> (SELECT count(DISTINCT (x ->> 'id') || '|' || upper(x ->> 'analise')) FROM jsonb_array_elements(p_itens) x) THEN
        RAISE EXCEPTION 'O mesmo lote apareceu duas vezes na mesma análise.';
    END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
        v_an := upper(COALESCE(e ->> 'analise', ''));
        v_sin := COALESCE(NULLIF(e ->> 'sinal', ''), '=');
        v_lido := (e ->> 'lido')::numeric;
        IF v_an NOT IN ('CT', 'BL72', 'BL120') THEN
            RAISE EXCEPTION 'Análise inválida: CT, BL72 ou BL120.';
        END IF;
        IF v_sin NOT IN ('<', '=', '>') OR v_lido IS NULL OR v_lido < 0 THEN
            RAISE EXCEPTION 'Valor inválido.';
        END IF;
        SELECT * INTO v_r FROM recebimento_nfc WHERE id = (e ->> 'id')::bigint;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Lote do recebimento NFC % não encontrado.', e ->> 'id';
        END IF;
        v_fin := trim_scale(v_lido * power(10::numeric, v_r.diluicao));
        SELECT * INTO v_at FROM contagens_nfc WHERE analise = v_an AND recebimento_nfc_id = v_r.id FOR UPDATE;
        IF v_at.id IS NOT NULL AND (v_at.sinal IS DISTINCT FROM v_sin OR v_at.valor_lido IS DISTINCT FROM v_lido) THEN
            v_corr := v_corr + 1;
        END IF;
        IF NOT p_previa THEN
            IF v_at.id IS NULL THEN
                INSERT INTO contagens_nfc (analise, recebimento_nfc_id, sinal, valor, valor_lido, diluicao, lido_por)
                VALUES (v_an, v_r.id, v_sin, v_fin, v_lido, v_r.diluicao, p_quem);
            ELSIF v_at.sinal IS DISTINCT FROM v_sin OR v_at.valor_lido IS DISTINCT FROM v_lido OR v_at.diluicao IS DISTINCT FROM v_r.diluicao THEN
                UPDATE contagens_nfc SET sinal = v_sin, valor = v_fin, valor_lido = v_lido, diluicao = v_r.diluicao, lido_por = p_quem, lido_em = now()
                WHERE id = v_at.id;
                INSERT INTO historico_alteracoes (tipo, tabela, registro_id, antes, depois, motivo, quem)
                VALUES ('corrigido', 'contagens_nfc', v_at.id,
                        jsonb_build_object('analise', v_an, 'sinal', v_at.sinal, 'valor', v_at.valor, 'valor_lido', v_at.valor_lido, 'diluicao', v_at.diluicao),
                        jsonb_build_object('analise', v_an, 'sinal', v_sin, 'valor', v_fin, 'valor_lido', v_lido, 'diluicao', v_r.diluicao),
                        'resultado lançado de novo', p_quem);
            END IF;
            v_n := v_n + 1;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'gravados', v_n, 'correcoes', v_corr);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- portas de entrada do bot ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recebimento_nfc_registrar_pelo_bot(p_telefone text, p_blocos jsonb) RETURNS jsonb AS $$
BEGIN
    RETURN registrar_recebimento_nfc(bot_quem(p_telefone), p_blocos);
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Lote, diluição, data ou resultado inválidos.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- a pendência do "sim" do C.T/B.L do NFC: itens [{analise, id, sinal, valor (final), lido}]
CREATE OR REPLACE FUNCTION contagem_nfc_lancar_pelo_bot(p_telefone text, p_itens jsonb) RETURNS jsonb AS $$
BEGIN
    RETURN lancar_contagem_nfc(bot_quem(p_telefone), p_itens);
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok', false, 'erro', 'Valor inválido.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION registrar_recebimento_nfc(bigint, jsonb, boolean), lancar_contagem_nfc(bigint, jsonb, boolean),
                       recebimento_nfc_registrar_pelo_bot(text, jsonb), contagem_nfc_lancar_pelo_bot(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registrar_recebimento_nfc(bigint, jsonb, boolean), lancar_contagem_nfc(bigint, jsonb, boolean),
                          recebimento_nfc_registrar_pelo_bot(text, jsonb), contagem_nfc_lancar_pelo_bot(text, jsonb) TO labflow_app;

COMMIT;
