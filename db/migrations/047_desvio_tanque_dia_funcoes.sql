-- 047 — desvio de tanque, repetição e "leitura do dia finalizada" por funções do banco (pedido PB17 da sessão do app, Fase E)
--
-- Depende da 016 (desvios_tanque), da 011 (leituras_finalizadas) e da 042 (tanque_exigir_cargo, bot_quem). Aplicar, como
-- labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 047_desvio_tanque_dia_funcoes.sql
-- Desfazer: 047_desvio_tanque_dia_funcoes_desfazer.sql (publique antes o workflow que ainda não chama estas funções).
--
-- Regra da Fase E: o bot e o app chamam a MESMA função. Estas repetem o que o bot faz hoje:
--   abrir_desvio_tanque(quem, analise_id, etapa pre|final)
--     -> leitura de tanque não ok: abre o desvio e cria a repetição da mesma análise com o frasco de arquivo, com os prazos
--        contados de hoje (C.T 2 dias; B.L pré 3 e final 5; WORT pré 5 e final 10). Leitura que já tem desvio: recusa.
--        O desvio fecha sozinho com o resultado da repetição (gatilho da 016).
--   registrar_repeticao(quem, desvio_id)
--     -> marca que a repetição foi feita (quem e quando). Já marcada: recusa.
--   finalizar_leitura_do_dia(quem, previa DEFAULT false)
--     -> marca como lido tudo o que sai hoje: placas que ninguém digitou nas leituras de tanque viram "<1" automático,
--        pré-leituras e leituras finais de hoje, drops de hoje e TAB/Coliformes incubados com leitura hoje (negativos);
--        C.T/B.L do concentrado e o que está em confirmação não mudam. Registra quem finalizou o dia.
-- Admin e Analista. jsonb {ok: true, ...}; erro de regra sai como exceção em português; as portas de entrada do bot
-- devolvem {ok: false, erro}. SECURITY DEFINER com search_path fixo; o GRANT do app fica com o app.

BEGIN;

CREATE OR REPLACE FUNCTION abrir_desvio_tanque(p_quem bigint, p_analise_id bigint, p_etapa text) RETURNS jsonb AS $$
DECLARE
    v_a   analises;
    v_rep bigint;
    v_id  bigint;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF COALESCE(p_etapa, '') NOT IN ('pre', 'final') THEN
        RAISE EXCEPTION 'Etapa inválida: pre ou final.';
    END IF;
    SELECT * INTO v_a FROM analises WHERE id = p_analise_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Leitura não encontrada.';
    END IF;
    IF EXISTS (SELECT 1 FROM desvios_tanque d WHERE d.analise_id = p_analise_id) THEN
        RAISE EXCEPTION 'Essa leitura já tem desvio.';
    END IF;
    INSERT INTO analises (coleta_id, frasco, sub_analise, metodo, data_analise, pre_leitura_prevista, leitura_final_prevista,
                          status, registrado_por, repeticao_de)
    VALUES (v_a.coleta_id, v_a.frasco, v_a.sub_analise, v_a.metodo, CURRENT_DATE,
            CASE v_a.sub_analise WHEN 'CT' THEN NULL WHEN 'BL' THEN CURRENT_DATE + 3 ELSE CURRENT_DATE + 5 END,
            CURRENT_DATE + CASE v_a.sub_analise WHEN 'CT' THEN 2 WHEN 'BL' THEN 5 ELSE 10 END,
            CASE v_a.sub_analise WHEN 'CT' THEN 'Aguardando Leitura Final' ELSE 'Aguardando Pré-Leitura' END,
            p_quem, v_a.id)
    RETURNING id INTO v_rep;
    INSERT INTO desvios_tanque (analise_id, etapa, repeticao_id, data_abertura, aberto_por)
    VALUES (v_a.id, p_etapa, v_rep, CURRENT_DATE, p_quem) RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'desvio_id', v_id, 'repeticao_id', v_rep, 'abertos', 1,
        'texto', 'Desvio aberto: repetição com o frasco de arquivo, leitura final em '
                 || to_char(CURRENT_DATE + CASE v_a.sub_analise WHEN 'CT' THEN 2 WHEN 'BL' THEN 5 ELSE 10 END, 'DD/MM/YYYY') || '.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION registrar_repeticao(p_quem bigint, p_desvio_id bigint) RETURNS jsonb AS $$
DECLARE
    v_em timestamptz;
    v_ok boolean;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    SELECT repeticao_em, true INTO v_em, v_ok FROM desvios_tanque WHERE id = p_desvio_id FOR UPDATE;
    IF v_ok IS NULL THEN
        RAISE EXCEPTION 'Desvio não encontrado.';
    END IF;
    IF v_em IS NOT NULL THEN
        RAISE EXCEPTION 'A repetição desse desvio já foi registrada.';
    END IF;
    UPDATE desvios_tanque SET repeticao_por = p_quem, repeticao_em = now() WHERE id = p_desvio_id;
    RETURN jsonb_build_object('ok', true, 'repeticoes', 1, 'texto', 'Repetição registrada.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION finalizar_leitura_do_dia(p_quem bigint, p_previa boolean DEFAULT false) RETURNS jsonb AS $$
DECLARE
    v_pl  int := 0;
    v_pre int;
    v_fin int;
    v_dr  int;
    v_tst int;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF p_previa THEN
        SELECT count(*) FILTER (WHERE status = 'Aguardando Pré-Leitura' AND pre_leitura_prevista = CURRENT_DATE),
               count(*) FILTER (WHERE status = 'Aguardando Leitura Final' AND leitura_final_prevista = CURRENT_DATE)
        INTO v_pre, v_fin FROM analises;
        SELECT count(*) INTO v_dr FROM drops WHERE status = 'Pendente' AND data_prevista = CURRENT_DATE;
        SELECT count(*) INTO v_tst FROM testes
        WHERE teste_pai_id IS NULL AND status IN ('Incubada', 'Estriada') AND leitura_prevista = CURRENT_DATE;
        RETURN jsonb_build_object('ok', true, 'previa', true, 'leituras', v_pre + v_fin, 'drops', v_dr, 'testes', v_tst,
            'texto', 'Finalizar o dia: ' || (v_pre + v_fin) || ' leitura(s) de tanque, ' || v_dr || ' drop(s) e ' || v_tst || ' TAB/Coliformes negativo(s).');
    END IF;
    -- placas que ninguém digitou nas leituras de hoje: "<1" automático (antes de marcar como lido)
    WITH pl AS (
        INSERT INTO leituras_placas (analise_id, etapa, placa, sinal, valor, origem, lido_por)
        SELECT a.id, e.etapa, g.placa, '<', 1, 'automatico', p_quem
        FROM analises a
        CROSS JOIN LATERAL (VALUES ('pre', a.pre_leitura_prevista, a.status = 'Aguardando Pré-Leitura'),
                                   ('final', a.leitura_final_prevista, a.status <> 'Concluído')) e (etapa, prevista, pendente)
        CROSS JOIN generate_series(1, 3) g (placa)
        WHERE e.prevista = CURRENT_DATE AND e.pendente
        ON CONFLICT (analise_id, etapa, placa) DO NOTHING
        RETURNING analise_id
    )
    SELECT count(*) INTO v_pl FROM pl;
    UPDATE analises a SET status = 'Aguardando Leitura Final', pre_leitura_por = p_quem
    WHERE a.status = 'Aguardando Pré-Leitura' AND a.pre_leitura_prevista = CURRENT_DATE;
    GET DIAGNOSTICS v_pre = ROW_COUNT;
    UPDATE analises a SET status = 'Concluído', leitura_final_por = p_quem
    WHERE a.status = 'Aguardando Leitura Final' AND a.leitura_final_prevista = CURRENT_DATE;
    GET DIAGNOSTICS v_fin = ROW_COUNT;
    UPDATE drops d SET status = 'Concluído', concluido_por = p_quem, concluido_em = now()
    WHERE d.status = 'Pendente' AND d.data_prevista = CURRENT_DATE;
    GET DIAGNOSTICS v_dr = ROW_COUNT;
    UPDATE testes t SET status = 'Concluída', resultado = 'Negativo', resultado_por = p_quem, resultado_em = now()
    WHERE t.teste_pai_id IS NULL AND t.status IN ('Incubada', 'Estriada') AND t.leitura_prevista = CURRENT_DATE;
    GET DIAGNOSTICS v_tst = ROW_COUNT;
    INSERT INTO leituras_finalizadas (dia, usuario_id) VALUES (CURRENT_DATE, p_quem)
    ON CONFLICT (dia) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, finalizado_em = now();
    RETURN jsonb_build_object('ok', true, 'previa', false, 'placas_automaticas', v_pl, 'leituras', v_pre + v_fin, 'drops', v_dr,
        'testes', v_tst, 'finalizado', 1,
        'texto', 'Dia finalizado: ' || (v_pre + v_fin) || ' leitura(s) de tanque, ' || v_dr || ' drop(s) e ' || v_tst || ' TAB/Coliformes negativo(s).');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- portas de entrada do bot ------------------------------------------------------------------------------------------------
-- a pendência do "sim" do desvio de tanque: {acao: 'abrir', analise_id, etapa} ou {acao: 'repeticao', desvio_id}
CREATE OR REPLACE FUNCTION desvio_tanque_pelo_bot(p_telefone text, p_dados jsonb) RETURNS jsonb AS $$
BEGIN
    IF p_dados ->> 'acao' = 'abrir' THEN
        RETURN abrir_desvio_tanque(bot_quem(p_telefone), (p_dados ->> 'analise_id')::bigint, p_dados ->> 'etapa');
    ELSIF p_dados ->> 'acao' = 'repeticao' THEN
        RETURN registrar_repeticao(bot_quem(p_telefone), (p_dados ->> 'desvio_id')::bigint);
    END IF;
    RETURN jsonb_build_object('ok', false, 'erro', 'Ação de desvio inválida.');
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok', false, 'erro', 'Número inválido.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION leitura_dia_finalizar_pelo_bot(p_telefone text) RETURNS jsonb AS $$
BEGIN
    RETURN finalizar_leitura_do_dia(bot_quem(p_telefone));
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION abrir_desvio_tanque(bigint, bigint, text), registrar_repeticao(bigint, bigint),
                       finalizar_leitura_do_dia(bigint, boolean), desvio_tanque_pelo_bot(text, jsonb),
                       leitura_dia_finalizar_pelo_bot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION abrir_desvio_tanque(bigint, bigint, text), registrar_repeticao(bigint, bigint),
                          finalizar_leitura_do_dia(bigint, boolean), desvio_tanque_pelo_bot(text, jsonb),
                          leitura_dia_finalizar_pelo_bot(text) TO labflow_app;

COMMIT;
