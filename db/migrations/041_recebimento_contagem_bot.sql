-- 041 — o bot passa a gravar o recebimento de FCOJ e o C.T/B.L pelas funções da 040 (as mesmas que o app chama)
--
-- Depende da 040. Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 041_recebimento_contagem_bot.sql
-- Desfazer: 041_recebimento_contagem_bot_desfazer.sql (publique antes o workflow que ainda não chama estas funções).
--
-- Portas de entrada do bot (mesma ideia da 037): acham a pessoa pelo telefone, chamam a função da 040 e devolvem jsonb
-- {ok, ...} ou {ok: false, erro: "mensagem em português"}, sem derrubar o fluxo do n8n.
--   recebimento_registrar_pelo_bot(telefone, load, item, fabrica, lotes jsonb, data dd/mm/aaaa, menor10 '1'|'')
--     -> registrar_recebimento (o "Recebimento load ..." digitado, por áudio ou pela foto)
--   contagem_lancar_pelo_bot(telefone, dados jsonb)
--     -> lancar_contagem; dados é a pendência do "sim":
--        {acao: 'contagem', analise, alvo: 'lote'|'amostra', itens: [{id, sinal, valor}]}      (comando de C.T/B.L)
--        {acao: 'contagem_lote', itens: [{analise, id, sinal, valor}]}                         (foto de embarque, por amostra)
--        com várias análises, uma chamada por análise, tudo ou nada.

BEGIN;

CREATE OR REPLACE FUNCTION recebimento_registrar_pelo_bot(p_telefone text, p_load text, p_item text, p_fabrica text,
                                                          p_lotes jsonb, p_data text, p_menor10 text) RETURNS jsonb AS $$
DECLARE
    v_quem bigint;
BEGIN
    SELECT id INTO v_quem FROM usuarios WHERE telefone = p_telefone;
    IF v_quem IS NULL THEN
        RAISE EXCEPTION 'Número não cadastrado.';
    END IF;
    RETURN registrar_recebimento(v_quem, p_load, p_item, p_fabrica,
                                 ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_lotes, '[]'::jsonb))::int),
                                 to_date(p_data, 'DD/MM/YYYY'), COALESCE(p_menor10, '') = '1');
EXCEPTION
    WHEN raise_exception THEN
        RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Lote ou data inválidos.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION contagem_lancar_pelo_bot(p_telefone text, p_dados jsonb) RETURNS jsonb AS $$
DECLARE
    v_quem  bigint;
    v_chave text;
    v_an    text;
    v_r     jsonb;
    v_total int := 0;
BEGIN
    SELECT id INTO v_quem FROM usuarios WHERE telefone = p_telefone;
    IF v_quem IS NULL THEN
        RAISE EXCEPTION 'Número não cadastrado.';
    END IF;
    v_chave := CASE WHEN p_dados ->> 'acao' = 'contagem_lote' OR p_dados ->> 'alvo' = 'amostra'
                    THEN 'embarque_amostra_id' ELSE 'recebimento_lote_id' END;
    FOR v_an IN SELECT DISTINCT upper(COALESCE(e ->> 'analise', p_dados ->> 'analise'))
                FROM jsonb_array_elements(COALESCE(p_dados -> 'itens', '[]'::jsonb)) e LOOP
        v_r := lancar_contagem(v_quem, v_an,
            (SELECT jsonb_agg(jsonb_build_object(v_chave, (e ->> 'id')::bigint, 'sinal', e ->> 'sinal', 'valor', (e ->> 'valor')::numeric))
             FROM jsonb_array_elements(p_dados -> 'itens') e
             WHERE upper(COALESCE(e ->> 'analise', p_dados ->> 'analise')) = v_an));
        v_total := v_total + (v_r ->> 'gravados')::int;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'gravados', v_total);
EXCEPTION
    WHEN raise_exception THEN
        RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Valor inválido.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION recebimento_registrar_pelo_bot(text, text, text, text, jsonb, text, text),
                       contagem_lancar_pelo_bot(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recebimento_registrar_pelo_bot(text, text, text, text, jsonb, text, text),
                          contagem_lancar_pelo_bot(text, jsonb) TO labflow_app;

COMMIT;
