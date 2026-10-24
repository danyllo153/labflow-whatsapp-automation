-- 039 — corrigir um resultado de C.T/B.L já gravado, com um comando curto no WhatsApp (plano de 23/10/2026)
--
-- Depende da 027 (contagens_nfc), da 033 (historico_alteracoes) e da 035 (cargo Analista). Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 039_corrigir_resultado.sql
-- Desfazer: 039_corrigir_resultado_desfazer.sql.
--
-- "corrigir ct do load 43755 para <1": pelo load o banco sabe se é NFC (recebimento_nfc, item 129) ou FCOJ (recebimento do
-- concentrado). Com um lote só com esse resultado, é ele; com vários, pede o lote (e, no NFC, fresh ou past quando há os dois).
-- Embarque fica de fora por ora (a amostra é do navio, linha e fase, não do load): continua com o comando de sempre.
--   corrigir_resultado_pelo_bot('previa', dados, telefone): acha o resultado, mostra "era 21 → <1" e guarda a pendência do "sim"
--     (confirmacoes tipo IA, com o comando interno "resultado corrigido: {...}"), sem mudar nada;
--   corrigir_resultado_pelo_bot('gravar', dados, telefone): depois do "sim", grava o valor novo e o histórico (antes, depois,
--     motivo e quem). Recusa se o resultado mudou desde a pergunta.
--   dados (previa): {analise CT|BL72|BL120, load, item?, lote?, amostra? fresh|past, sinal <|=|>, valor, motivo?}
--   dados (gravar): {tabela contagens|contagens_nfc, id, analise, sinal, valor, era: {sinal, valor}, motivo?}
-- No NFC o valor é o da placa (como no "ct nfc ... deu"): o banco multiplica pela diluição gravada no resultado.
--
-- Decisões do Danyllo: só Admin e Analista (23/10); o motivo é OBRIGATÓRIO para o Analista e opcional para o Admin, e nos dois
-- casos fica guardado quem corrigiu (24/10, PR #238). Erro da regra volta como {ok: false, erro} (mesma ideia da 037).

BEGIN;

CREATE OR REPLACE FUNCTION corrigir_resultado_pelo_bot(p_fase text, p_dados jsonb, p_telefone text) RETURNS jsonb AS $$
DECLARE
    v_quem     bigint;
    v_cargo    text;
    v_motivo   text := NULLIF(trim(COALESCE(p_dados ->> 'motivo', '')), '');
    v_analise  text := upper(COALESCE(p_dados ->> 'analise', ''));
    v_sinal    text := COALESCE(NULLIF(p_dados ->> 'sinal', ''), '=');
    v_valor    numeric;
    v_num      text := trim(COALESCE(p_dados ->> 'load', ''));
    v_item     text := NULLIF(trim(COALESCE(p_dados ->> 'item', '')), '');
    v_lote     int := NULLIF(p_dados ->> 'lote', '')::int;
    v_amostra  text := NULLIF(lower(COALESCE(p_dados ->> 'amostra', '')), '');
    v_rotulo   text;
    v_n        int;
    v_lista    text;
    r          record;
    x          jsonb;
    v_final    numeric;
    v_antes    jsonb;
    v_depois   jsonb;
    v_dados    jsonb;
    v_resumo   text;
    v_rows     jsonb;
BEGIN
    SELECT id, cargo INTO v_quem, v_cargo FROM usuarios WHERE telefone = p_telefone;
    IF v_quem IS NULL THEN
        RAISE EXCEPTION 'Número não cadastrado.';
    END IF;
    IF v_cargo NOT IN ('Admin', 'Analista') THEN
        RAISE EXCEPTION 'Só Admin e Analista corrigem resultado.';
    END IF;
    IF v_cargo = 'Analista' AND v_motivo IS NULL THEN
        RAISE EXCEPTION 'Diga o motivo da correção no fim, ex.: corrigir ct do load 43755 para <1 motivo foto leu errado.';
    END IF;
    IF p_fase NOT IN ('previa', 'gravar') THEN
        RAISE EXCEPTION 'Fase desconhecida: %.', p_fase;
    END IF;
    IF v_analise NOT IN ('CT', 'BL72', 'BL120') THEN
        RAISE EXCEPTION 'Análise inválida: use ct, bl72 ou bl120.';
    END IF;
    IF v_sinal NOT IN ('<', '=', '>') THEN
        RAISE EXCEPTION 'Sinal inválido.';
    END IF;
    v_valor := (p_dados ->> 'valor')::numeric;
    IF v_valor IS NULL OR v_valor < 0 THEN
        RAISE EXCEPTION 'Valor inválido.';
    END IF;
    v_rotulo := CASE v_analise WHEN 'CT' THEN 'C.T 48h' WHEN 'BL72' THEN 'B.L 72h' ELSE 'B.L 120h' END;

    IF p_fase = 'gravar' THEN
        IF p_dados ->> 'tabela' = 'contagens' THEN
            SELECT c.id, c.sinal, c.valor, NULL::numeric AS lido, NULL::smallint AS diluicao INTO r
            FROM contagens c WHERE c.id = (p_dados ->> 'id')::bigint AND c.analise = v_analise FOR UPDATE;
        ELSIF p_dados ->> 'tabela' = 'contagens_nfc' THEN
            SELECT c.id, c.sinal, c.valor, c.valor_lido AS lido, c.diluicao INTO r
            FROM contagens_nfc c WHERE c.id = (p_dados ->> 'id')::bigint AND c.analise = v_analise FOR UPDATE;
        ELSE
            RAISE EXCEPTION 'Tabela inválida.';
        END IF;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'O resultado não existe mais.';
        END IF;
        IF r.sinal IS DISTINCT FROM (p_dados -> 'era' ->> 'sinal') OR r.valor IS DISTINCT FROM (p_dados -> 'era' ->> 'valor')::numeric THEN
            RAISE EXCEPTION 'O resultado mudou desde a pergunta: mande o comando de novo.';
        END IF;
        IF p_dados ->> 'tabela' = 'contagens' THEN
            v_antes := jsonb_build_object('analise', v_analise, 'sinal', r.sinal, 'valor', r.valor);
            UPDATE contagens SET sinal = v_sinal, valor = v_valor WHERE id = r.id;
            v_depois := jsonb_build_object('analise', v_analise, 'sinal', v_sinal, 'valor', v_valor);
        ELSE
            v_final := trim_scale(v_valor * power(10::numeric, r.diluicao));
            v_antes := jsonb_build_object('analise', v_analise, 'sinal', r.sinal, 'valor', r.valor, 'valor_lido', r.lido, 'diluicao', r.diluicao);
            UPDATE contagens_nfc SET sinal = v_sinal, valor = v_final, valor_lido = v_valor WHERE id = r.id;
            v_depois := jsonb_build_object('analise', v_analise, 'sinal', v_sinal, 'valor', v_final, 'valor_lido', v_valor, 'diluicao', r.diluicao);
        END IF;
        INSERT INTO historico_alteracoes (tipo, tabela, registro_id, antes, depois, motivo, quem)
        VALUES ('corrigido', p_dados ->> 'tabela', r.id, v_antes, v_depois, v_motivo, v_quem);
        RETURN jsonb_build_object('ok', true, 'fase', 'gravar', 'resumo', p_dados ->> 'resumo');
    END IF;

    -- prévia: os resultados dessa análise no load (FCOJ e NFC), filtrados pelo que a pessoa disse
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.lote, q.amostra), '[]'::jsonb) INTO v_rows FROM (
        SELECT 'contagens' AS tabela, c.id, 'FCOJ' AS tipo, i.codigo AS item, rl.lote, NULL::text AS amostra,
               c.sinal, c.valor, NULL::numeric AS lido, NULL::smallint AS diluicao
        FROM contagens c JOIN recebimento_lotes rl ON rl.id = c.recebimento_lote_id
        JOIN loads l ON l.id = rl.load_id JOIN itens i ON i.id = l.item_id
        WHERE c.analise = v_analise AND l.numero = v_num AND (v_item IS NULL OR i.codigo = v_item)
          AND (v_lote IS NULL OR rl.lote = v_lote) AND v_amostra IS NULL
        UNION ALL
        SELECT 'contagens_nfc', c.id, 'NFC', i.codigo, rn.lote, rn.amostra, c.sinal, c.valor, c.valor_lido, c.diluicao
        FROM contagens_nfc c JOIN recebimento_nfc rn ON rn.id = c.recebimento_nfc_id
        JOIN loads l ON l.id = rn.load_id JOIN itens i ON i.id = l.item_id
        WHERE c.analise = v_analise AND l.numero = v_num AND (v_item IS NULL OR i.codigo = v_item)
          AND (v_lote IS NULL OR rn.lote = v_lote) AND (v_amostra IS NULL OR rn.amostra = v_amostra)
    ) q;

    v_n := jsonb_array_length(v_rows);
    IF v_n = 0 THEN
        RAISE EXCEPTION 'Não achei % gravado no load %.', v_rotulo, v_num
            || CASE WHEN v_item IS NULL THEN '' ELSE ' item ' || v_item END
            || CASE WHEN v_lote IS NULL THEN '' ELSE ' lote ' || v_lote END || COALESCE(' ' || v_amostra, '');
    END IF;
    IF v_n > 1 THEN
        SELECT string_agg(DISTINCT e ->> 'item', ', ') INTO v_lista FROM jsonb_array_elements(v_rows) e;
        IF v_lista LIKE '%,%' THEN
            RAISE EXCEPTION 'Há mais de um load % (itens %): diga o item, ex.: corrigir % do load % item % para ...',
                v_num, v_lista, lower(v_analise), v_num, split_part(v_lista, ', ', 1);
        END IF;
        SELECT string_agg(lote::text, ', ' ORDER BY lote) INTO v_lista
        FROM (SELECT DISTINCT (e ->> 'lote')::int AS lote FROM jsonb_array_elements(v_rows) e) z;
        IF v_lista LIKE '%,%' THEN
            RAISE EXCEPTION 'O load % tem % em mais de um lote (%): diga o lote, ex.: corrigir % do load % lote % para ...',
                v_num, v_rotulo, v_lista, lower(v_analise), v_num, split_part(v_lista, ', ', 1);
        END IF;
        RAISE EXCEPTION 'O lote % do load % tem fresh e past: diga qual, ex.: corrigir % do load % lote % fresh para ...',
            v_lista, v_num, lower(v_analise), v_num, v_lista;
    END IF;

    x := v_rows -> 0;
    SELECT x ->> 'tabela' AS tabela, (x ->> 'id')::bigint AS id, x ->> 'tipo' AS tipo, x ->> 'item' AS item,
           (x ->> 'lote')::int AS lote, x ->> 'amostra' AS amostra, x ->> 'sinal' AS sinal, (x ->> 'valor')::numeric AS valor,
           (x ->> 'lido')::numeric AS lido, (x ->> 'diluicao')::smallint AS diluicao INTO r;
    IF r.tipo = 'NFC' THEN
        v_final := trim_scale(v_valor * power(10::numeric, r.diluicao));
        IF r.sinal = v_sinal AND r.lido = v_valor THEN
            RAISE EXCEPTION 'O valor novo é igual ao que está gravado.';
        END IF;
        v_resumo := v_rotulo || ' do load ' || v_num || ' lote ' || r.lote || ' ' || r.amostra || ' (NFC, 10^' || r.diluicao || '): era '
            || (CASE WHEN r.sinal = '=' THEN '' ELSE r.sinal END) || replace(trim_scale(r.lido)::text, '.', ',')
            || ' (' || (CASE WHEN r.sinal = '=' THEN '' ELSE r.sinal END) || replace(trim_scale(r.valor)::text, '.', ',') || ') → '
            || (CASE WHEN v_sinal = '=' THEN '' ELSE v_sinal END) || replace(trim_scale(v_valor)::text, '.', ',')
            || ' (' || (CASE WHEN v_sinal = '=' THEN '' ELSE v_sinal END) || replace(trim_scale(v_final)::text, '.', ',') || ')';
    ELSE
        IF r.sinal = v_sinal AND r.valor = v_valor THEN
            RAISE EXCEPTION 'O valor novo é igual ao que está gravado.';
        END IF;
        v_resumo := v_rotulo || ' do load ' || v_num || ' item ' || r.item || ' lote ' || r.lote || ': era '
            || (CASE WHEN r.sinal = '=' THEN '' ELSE r.sinal END) || replace(trim_scale(r.valor)::text, '.', ',') || ' → '
            || (CASE WHEN v_sinal = '=' THEN '' ELSE v_sinal END) || replace(trim_scale(v_valor)::text, '.', ',');
    END IF;

    v_dados := jsonb_build_object('tabela', r.tabela, 'id', r.id, 'analise', v_analise, 'sinal', v_sinal, 'valor', v_valor,
        'era', jsonb_build_object('sinal', r.sinal, 'valor', r.valor), 'motivo', v_motivo, 'resumo', v_resumo);
    INSERT INTO confirmacoes (usuario_id, tipo, payload, resumo, criado_em)
    VALUES (v_quem, 'IA', jsonb_build_object('comando', 'resultado corrigido: ' || v_dados::text), v_resumo, now())
    ON CONFLICT (usuario_id) DO UPDATE
      SET tipo = EXCLUDED.tipo, payload = EXCLUDED.payload, resumo = EXCLUDED.resumo, criado_em = now();
    RETURN jsonb_build_object('ok', true, 'fase', 'previa', 'resumo', v_resumo, 'motivo', v_motivo);
EXCEPTION
    WHEN raise_exception THEN
        RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Número inválido.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION corrigir_resultado_pelo_bot(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION corrigir_resultado_pelo_bot(text, jsonb, text) TO labflow_app;

COMMIT;
