-- 037 — porta de entrada do bot para corrigir e apagar recebimento (usa as funções da 036)
--
-- Depende da 036. Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 037_recebimento_bot.sql
-- Desfazer: 037_recebimento_bot_desfazer.sql.
--
-- O WhatsApp fala em número de load e de lote ("corrigir lote 4 do load 43670 para 40"); as funções da 036 recebem ids.
-- recebimento_pelo_bot(acao, dados, telefone) acha o load (e o lote) pelo número, chama a função certa e devolve um jsonb
-- {ok, ...} ou {ok: false, erro: "mensagem em português"}: o erro da regra volta como texto, sem derrubar o fluxo do n8n
-- (mesma ideia do gravar_cargo_bot da 031). A permissão (Admin e Analista) continua sendo conferida pelas funções da 036.
--   acao 'load'    dados {load, item?, campos: {numero | item | fabrica}}   -> corrigir_load
--   acao 'lote'    dados {load, item?, lote, campos: {lote | data_recebimento}} -> corrigir_recebimento
--   acao 'excluir' dados {load, item?, lote}                                 -> excluir_recebimento
-- Load com o mesmo número em mais de um item: pede o item. O recebimento do concentrado não usa o item 129 (NFC).

BEGIN;

CREATE OR REPLACE FUNCTION recebimento_pelo_bot(p_acao text, p_dados jsonb, p_telefone text) RETURNS jsonb AS $$
DECLARE
    v_quem   bigint;
    v_load   loads;
    v_n      int;
    v_itens  text;
    v_lote   recebimento_lotes;
    v_antes  jsonb;
    v_depois jsonb;
    v_reg    registros_excluidos;
    v_num    text := trim(COALESCE(p_dados ->> 'load', ''));
    v_item   text := NULLIF(trim(COALESCE(p_dados ->> 'item', '')), '');
BEGIN
    SELECT id INTO v_quem FROM usuarios WHERE telefone = p_telefone;
    IF v_quem IS NULL THEN
        RAISE EXCEPTION 'Número não cadastrado.';
    END IF;
    IF p_acao NOT IN ('load', 'lote', 'excluir') THEN
        RAISE EXCEPTION 'Ação desconhecida: %.', p_acao;
    END IF;

    -- o load pelo número (e pelo item, quando a pessoa disse); para lote, só loads com recebimento de concentrado
    SELECT count(*), string_agg(DISTINCT i.codigo, ', ') INTO v_n, v_itens
    FROM loads l JOIN itens i ON i.id = l.item_id
    WHERE l.numero = v_num AND (v_item IS NULL OR i.codigo = v_item)
      AND (p_acao = 'load' OR EXISTS (SELECT 1 FROM recebimento_lotes r WHERE r.load_id = l.id));
    IF v_n = 0 THEN
        RAISE EXCEPTION 'Não achei o load % no recebimento.', v_num || CASE WHEN v_item IS NULL THEN '' ELSE ' com o item ' || v_item END;
    END IF;
    IF v_n > 1 THEN
        RAISE EXCEPTION 'Há mais de um load % (itens %): diga o item, ex.: load % item %.', v_num, v_itens, v_num, split_part(v_itens, ', ', 1);
    END IF;
    SELECT l.* INTO v_load FROM loads l JOIN itens i ON i.id = l.item_id
    WHERE l.numero = v_num AND (v_item IS NULL OR i.codigo = v_item)
      AND (p_acao = 'load' OR EXISTS (SELECT 1 FROM recebimento_lotes r WHERE r.load_id = l.id));

    IF p_acao = 'load' THEN
        v_antes := jsonb_build_object('numero', v_load.numero, 'item', (SELECT codigo FROM itens WHERE id = v_load.item_id),
                                      'fabrica', (SELECT nome FROM fabricas WHERE id = v_load.fabrica_id));
        v_load := corrigir_load(v_load.id, p_dados -> 'campos', v_quem);
        v_depois := jsonb_build_object('numero', v_load.numero, 'item', (SELECT codigo FROM itens WHERE id = v_load.item_id),
                                       'fabrica', (SELECT nome FROM fabricas WHERE id = v_load.fabrica_id));
        RETURN jsonb_build_object('ok', true, 'antes', v_antes, 'depois', v_depois,
                                  'lotes', (SELECT count(*) FROM recebimento_lotes WHERE load_id = v_load.id));
    END IF;

    SELECT * INTO v_lote FROM recebimento_lotes WHERE load_id = v_load.id AND lote = (p_dados ->> 'lote')::int;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'O load % não tem o lote %.', v_load.numero, p_dados ->> 'lote';
    END IF;
    IF p_acao = 'lote' THEN
        v_antes := jsonb_build_object('lote', v_lote.lote, 'data_recebimento', to_char(v_lote.data_recebimento, 'DD/MM/YYYY'));
        v_lote := corrigir_recebimento(v_lote.id, p_dados -> 'campos', v_quem);
        v_depois := jsonb_build_object('lote', v_lote.lote, 'data_recebimento', to_char(v_lote.data_recebimento, 'DD/MM/YYYY'));
        RETURN jsonb_build_object('ok', true, 'load', v_load.numero, 'antes', v_antes, 'depois', v_depois);
    END IF;
    v_reg := excluir_recebimento(v_lote.id, v_quem, 'apagado pelo WhatsApp');
    RETURN jsonb_build_object('ok', true, 'load', v_load.numero, 'lote', v_lote.lote,
                              'restam', (SELECT count(*) FROM recebimento_lotes WHERE load_id = v_load.id));
EXCEPTION
    WHEN raise_exception THEN
        RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Número de lote inválido.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION recebimento_pelo_bot(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recebimento_pelo_bot(text, jsonb, text) TO labflow_app;

COMMIT;
