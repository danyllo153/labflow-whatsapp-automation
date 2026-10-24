-- 044 — drops e desvio de drop por funções do banco (pedido PB15 da sessão do app, Fase E)
--
-- Depende da 042 (tanque_exigir_cargo, bot_quem) e da 012 (desvios_drop). Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 044_drops_funcoes.sql
-- Desfazer: 044_drops_funcoes_desfazer.sql (publique antes o workflow que ainda não chama estas funções).
--
-- Regra da Fase E: o bot e o app chamam a MESMA função. Estas repetem o que o bot faz hoje:
--   concluir_drops(quem, ids DEFAULT NULL, origem DEFAULT NULL, dia DEFAULT NULL, navio DEFAULT NULL, previa DEFAULT false)
--     -> com ids (o app marca na lista): conclui esses drops pendentes que já venceram (até hoje);
--        sem ids (o "drops concluídos" do bot): conclui os pendentes de HOJE, da origem (terra|navio), do dia (5, 10 ou 15) e
--        do navio pedidos. Devolve a lista dos que foram concluídos.
--   abrir_desvio_drop(quem, drop_id)
--     -> drop não ok: abre o desvio (repetição do drop de arquivo em 7, 13 e 25 °C, leitura em até 5 dias) e conta o drop
--        como lido. Drop que já tem desvio: recusa.
--   fechar_desvio_drop(quem, desvio_id, temperaturas)
--     -> grava o resultado: confirmou nas temperaturas ditas (7, 13 e/ou 25) ou, sem nenhuma, não confirmou.
-- Admin e Analista. jsonb {ok: true, ..., texto}; erro de regra sai como exceção em português; as portas de entrada do bot
-- devolvem {ok: false, erro}. SECURITY DEFINER com search_path fixo; o GRANT do app fica com o app.

BEGIN;

CREATE OR REPLACE FUNCTION concluir_drops(p_quem bigint, p_ids bigint[] DEFAULT NULL, p_origem text DEFAULT NULL,
                                          p_dia int DEFAULT NULL, p_navio text DEFAULT NULL, p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_origem text := NULLIF(lower(trim(COALESCE(p_origem, ''))), '');
    v_navio  text := NULLIF(upper(trim(COALESCE(p_navio, ''))), '');
    v_lista  jsonb;
    v_n      int;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF p_ids IS NULL AND v_origem IS NULL THEN
        RAISE EXCEPTION 'Diga os drops (ou terra/navio).';
    END IF;
    IF v_origem IS NOT NULL AND v_origem NOT IN ('terra', 'navio') THEN
        RAISE EXCEPTION 'Origem inválida: terra ou navio.';
    END IF;
    IF p_dia IS NOT NULL AND p_dia NOT IN (5, 10, 15) THEN
        RAISE EXCEPTION 'Drop inválido: D5, D10 ou D15.';
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'dia', d.dia, 'tanque', c.tanque, 'navio', trim(n.nome || ' ' || n.viagem),
                                                 'data_coleta', to_char(c.data_coleta, 'DD/MM/YYYY'))
                              ORDER BY d.dia, n.nome NULLS FIRST, length(c.tanque), c.tanque), '[]'::jsonb)
    INTO v_lista
    FROM drops d JOIN coletas c ON c.id = d.coleta_id LEFT JOIN navios n ON n.id = c.navio_id
    WHERE d.status = 'Pendente'
      AND CASE WHEN p_ids IS NOT NULL THEN d.id = ANY (p_ids) AND d.data_prevista <= CURRENT_DATE
               ELSE d.data_prevista = CURRENT_DATE AND c.origem = v_origem
                    AND (p_dia IS NULL OR d.dia = p_dia)
                    AND (v_navio IS NULL OR upper(trim(n.nome || ' ' || n.viagem)) = v_navio) END;
    v_n := jsonb_array_length(v_lista);
    IF NOT p_previa AND v_n > 0 THEN
        UPDATE drops SET status = 'Concluído', concluido_por = p_quem, concluido_em = now()
        WHERE id IN (SELECT (x ->> 'id')::bigint FROM jsonb_array_elements(v_lista) x) AND status = 'Pendente';
    END IF;
    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'concluidos', v_n, 'drops', v_lista,
        'texto', CASE WHEN v_n = 0 THEN 'Nenhum drop pendente para concluir.'
                      ELSE v_n || ' drop' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ': '
                           || (SELECT string_agg('tanque ' || (x ->> 'tanque') || COALESCE(' ' || (x ->> 'navio'), '') || ' D' || (x ->> 'dia'), ', ')
                               FROM jsonb_array_elements(v_lista) x) || '.' END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION abrir_desvio_drop(p_quem bigint, p_drop_id bigint) RETURNS jsonb AS $$
DECLARE
    v_d   drops;
    v_id  bigint;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    SELECT * INTO v_d FROM drops WHERE id = p_drop_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Drop não encontrado.';
    END IF;
    IF EXISTS (SELECT 1 FROM desvios_drop WHERE drop_id = p_drop_id) THEN
        RAISE EXCEPTION 'Esse drop já tem desvio.';
    END IF;
    INSERT INTO desvios_drop (drop_id, data_abertura, leitura_prevista, aberto_por)
    VALUES (p_drop_id, CURRENT_DATE, CURRENT_DATE + 5, p_quem) RETURNING id INTO v_id;
    UPDATE drops SET status = 'Concluído', concluido_por = p_quem, concluido_em = now() WHERE id = p_drop_id AND status = 'Pendente';
    RETURN jsonb_build_object('ok', true, 'desvio_id', v_id, 'ler_ate', to_char(CURRENT_DATE + 5, 'DD/MM/YYYY'),
        'texto', 'Desvio aberto: repetição do drop de arquivo em 7 °C, 13 °C e 25 °C, leitura até ' || to_char(CURRENT_DATE + 5, 'DD/MM/YYYY') || '.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION fechar_desvio_drop(p_quem bigint, p_desvio_id bigint, p_temperaturas int[]) RETURNS jsonb AS $$
DECLARE
    v_t  int[];
    v_st text;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), '{}') INTO v_t FROM unnest(COALESCE(p_temperaturas, '{}')) t;
    IF NOT v_t <@ ARRAY[7, 13, 25] THEN
        RAISE EXCEPTION 'Temperatura inválida: 7, 13 ou 25 °C.';
    END IF;
    SELECT status INTO v_st FROM desvios_drop WHERE id = p_desvio_id FOR UPDATE;
    IF v_st IS NULL THEN
        RAISE EXCEPTION 'Desvio não encontrado.';
    END IF;
    IF v_st <> 'Em confirmação' THEN
        RAISE EXCEPTION 'Esse desvio já foi fechado.';
    END IF;
    UPDATE desvios_drop
    SET status = 'Concluído', temperaturas = v_t,
        resultado = CASE WHEN cardinality(v_t) > 0 THEN 'Confirmado' ELSE 'Não confirmado' END,
        resultado_por = p_quem, resultado_em = now()
    WHERE id = p_desvio_id;
    RETURN jsonb_build_object('ok', true, 'resultado', CASE WHEN cardinality(v_t) > 0 THEN 'Confirmado' ELSE 'Não confirmado' END,
        'texto', 'Desvio fechado: ' || CASE WHEN cardinality(v_t) > 0
                                            THEN 'confirmou em ' || array_to_string(v_t, ', ') || ' °C' ELSE 'não confirmou' END || '.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- portas de entrada do bot ------------------------------------------------------------------------------------------------
-- "drops concluídos": origem Terra|Navio, dia "D5"|"D10"|"D15"|vazio, navio (só no navio)
CREATE OR REPLACE FUNCTION drops_concluir_pelo_bot(p_telefone text, p_origem text, p_dia text, p_navio text) RETURNS jsonb AS $$
BEGIN
    RETURN concluir_drops(bot_quem(p_telefone), NULL, p_origem, NULLIF(substring(COALESCE(p_dia, '') from 2), '')::int, p_navio);
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation THEN RETURN jsonb_build_object('ok', false, 'erro', 'Drop inválido: D5, D10 ou D15.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- a pendência do "sim" do desvio: {acao: 'abrir', drop_id} ou {acao: 'fechar', desvio_id, temps}
CREATE OR REPLACE FUNCTION desvio_drop_pelo_bot(p_telefone text, p_dados jsonb) RETURNS jsonb AS $$
BEGIN
    IF p_dados ->> 'acao' = 'abrir' THEN
        RETURN abrir_desvio_drop(bot_quem(p_telefone), (p_dados ->> 'drop_id')::bigint);
    ELSIF p_dados ->> 'acao' = 'fechar' THEN
        RETURN fechar_desvio_drop(bot_quem(p_telefone), (p_dados ->> 'desvio_id')::bigint,
                                  ARRAY(SELECT t::int FROM jsonb_array_elements_text(COALESCE(p_dados -> 'temps', '[]'::jsonb)) t));
    END IF;
    RETURN jsonb_build_object('ok', false, 'erro', 'Ação de desvio inválida.');
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok', false, 'erro', 'Número inválido.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION concluir_drops(bigint, bigint[], text, int, text, boolean), abrir_desvio_drop(bigint, bigint),
                       fechar_desvio_drop(bigint, bigint, int[]), drops_concluir_pelo_bot(text, text, text, text),
                       desvio_drop_pelo_bot(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION concluir_drops(bigint, bigint[], text, int, text, boolean), abrir_desvio_drop(bigint, bigint),
                          fechar_desvio_drop(bigint, bigint, int[]), drops_concluir_pelo_bot(text, text, text, text),
                          desvio_drop_pelo_bot(text, jsonb) TO labflow_app;

COMMIT;
