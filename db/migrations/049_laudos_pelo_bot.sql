-- 049 — esterilização, água do processo, baias e linhas por frase no WhatsApp (pedidos PB8 e PB9 do app)
--
-- Depende da 067 do app (funções app.bot_*), da 035 (cargo Analista) e da tabela confirmacoes. Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 049_laudos_pelo_bot.sql
-- Desfazer: 049_laudos_pelo_bot_desfazer.sql (publique antes o workflow anterior).
--
-- laudo_registrar_pelo_bot(fase, dados, telefone) -> jsonb {ok, fase, resumo} ou {ok: false, erro}
--   dados.acao: esterilizar | agua_coletar | agua_lancar | superficie_coletar | superficie_lancar
--   fase 'previa': roda a função do app dentro de um bloco que é desfeito (a regra do app confere tudo, inclusive o cargo),
--       guarda a pendência do "sim" (confirmacoes, tipo IA, comando "laudo registrado: {dados}") e devolve o resumo;
--   fase 'gravar' (depois do "sim"): roda de verdade e devolve o resumo do que ficou gravado.
-- Quem pode e as demais regras ficam nas funções do app (067): esterilização e resultados = Admin e Analista; coletas = Admin,
-- Analista e Coletor. dados.data (dd/mm/aaaa) e dados.hora (hh:mm) opcionais; sem eles vale agora.

BEGIN;

CREATE OR REPLACE FUNCTION laudo_registrar_pelo_bot(p_fase text, p_dados jsonb, p_telefone text) RETURNS jsonb AS $$
DECLARE
    v_quem    bigint;
    v_acao    text := p_dados ->> 'acao';
    v_dia     date;
    v_hora    text;
    v_quando  timestamptz;
    v_resumo  text;
    v_lista   text;
    v_agua    record;
    v_sup     record;
    v_tipo    text;
    r         record;
BEGIN
    SELECT id INTO v_quem FROM usuarios WHERE telefone = p_telefone;
    IF v_quem IS NULL THEN
        RAISE EXCEPTION 'Número não cadastrado.';
    END IF;
    IF p_fase NOT IN ('previa', 'gravar') THEN
        RAISE EXCEPTION 'Fase desconhecida: %.', p_fase;
    END IF;
    IF v_acao IS NULL OR v_acao NOT IN ('esterilizar', 'agua_coletar', 'agua_lancar', 'superficie_coletar', 'superficie_lancar') THEN
        RAISE EXCEPTION 'Não entendi o registro.';
    END IF;

    IF nullif(p_dados ->> 'data', '') IS NULL THEN
        v_quando := now();
    ELSE
        v_dia := to_date(p_dados ->> 'data', 'DD/MM/YYYY');
        v_hora := nullif(p_dados ->> 'hora', '');
        v_quando := CASE WHEN v_hora IS NOT NULL THEN (v_dia + v_hora::time) AT TIME ZONE 'America/Sao_Paulo'
                         WHEN v_dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN now()
                         ELSE (v_dia + time '12:00') AT TIME ZONE 'America/Sao_Paulo' END;
    END IF;

    BEGIN
        IF v_acao = 'esterilizar' THEN
            v_lista := NULL;
            FOR r IN SELECT * FROM app.bot_registrar_esterilizacao(v_quem,
                         ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_dados -> 'tipos', '[]'::jsonb))),
                         p_dados ->> 'ciclo', p_dados ->> 'meio', p_dados ->> 'descricao', v_quando) LOOP
                v_lista := concat_ws(', ', v_lista, CASE r.tipo WHEN 'Meio' THEN 'meio de cultura' ELSE lower(r.tipo) END
                                     || COALESCE(' (' || r.meio || ')', '') || COALESCE(' (' || r.descricao || ')', ''));
                v_dia := r.dia;
            END LOOP;
            v_resumo := 'Esterilização, ciclo ' || trim(p_dados ->> 'ciclo') || ', dia ' || to_char(v_dia, 'DD/MM/YYYY') || ': ' || v_lista;

        ELSIF v_acao = 'agua_coletar' THEN
            v_agua := app.bot_coletar_agua(v_quem, ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_dados -> 'pontos', '[]'::jsonb))),
                                           v_quando, p_dados ->> 'observacao');
            SELECT string_agg(z.nome, ', ' ORDER BY z.ord) INTO v_lista FROM (VALUES
                (1, 'Manifold', v_agua.manifold), (2, 'Câmara 4', v_agua.camara4), (3, 'Câmara 5', v_agua.camara5),
                (4, 'Câmara 6', v_agua.camara6)) AS z(ord, nome, col) WHERE z.col;
            v_resumo := 'Água do processo, coleta de ' || to_char(v_agua.coletada_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                || ': ' || v_lista;

        ELSIF v_acao = 'agua_lancar' THEN
            v_agua := app.bot_lancar_agua(v_quem, COALESCE(p_dados -> 'ct', '{}'::jsonb), COALESCE(p_dados -> 'bl', '{}'::jsonb), NULL);
            SELECT string_agg(z.nome || ': C.T ' || COALESCE(z.ct, '—') || ', B.L ' || COALESCE(z.bl, '—'), E'\n' ORDER BY z.ord) INTO v_lista
            FROM (VALUES
                (1, 'Manifold', v_agua.manifold, v_agua.ct_manifold, v_agua.bl_manifold),
                (2, 'Câmara 4', v_agua.camara4, v_agua.ct_camara4, v_agua.bl_camara4),
                (3, 'Câmara 5', v_agua.camara5, v_agua.ct_camara5, v_agua.bl_camara5),
                (4, 'Câmara 6', v_agua.camara6, v_agua.ct_camara6, v_agua.bl_camara6)) AS z(ord, nome, col, ct, bl) WHERE z.col;
            v_resumo := 'Água do processo, coleta de ' || to_char(v_agua.coletada_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                || E':\n' || v_lista;

        ELSIF v_acao = 'superficie_coletar' THEN
            v_tipo := p_dados ->> 'tipo';
            v_lista := NULL;
            FOR r IN SELECT * FROM app.bot_coletar_superficie(v_quem, v_tipo,
                         ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_dados -> 'pontos', '[]'::jsonb))), v_quando,
                         to_date(NULLIF(p_dados ->> 'analise', ''), 'DD/MM/YYYY'), p_dados ->> 'observacao') LOOP
                v_lista := concat_ws(', ', v_lista, r.ponto);
                v_dia := r.analisada_em;
            END LOOP;
            v_resumo := v_tipo || ' ' || v_lista || ': coleta de ' || to_char(v_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                || ', análise em ' || to_char(v_dia, 'DD/MM/YYYY');

        ELSE
            v_sup := app.bot_lancar_superficie(v_quem, p_dados ->> 'tipo', p_dados ->> 'ponto', COALESCE(p_dados -> 'campos', '{}'::jsonb), NULL);
            v_resumo := v_sup.tipo || ' ' || v_sup.ponto || ', coleta de ' || to_char(v_sup.coletada_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
                || ': C.T 48h ' || COALESCE(v_sup.ct_48, '—') || ' · B.L 72h ' || COALESCE(v_sup.bl_72, '—') || ' · B.L 120h ' || COALESCE(v_sup.bl_120, '—');
        END IF;

        IF p_fase = 'previa' THEN
            RAISE EXCEPTION USING ERRCODE = 'P0999', MESSAGE = 'desfaz a prévia';
        END IF;
    EXCEPTION
        WHEN SQLSTATE 'P0999' THEN NULL;
    END;

    IF p_fase = 'previa' THEN
        INSERT INTO confirmacoes (usuario_id, tipo, payload, resumo, criado_em)
        VALUES (v_quem, 'IA', jsonb_build_object('comando', 'laudo registrado: ' || p_dados::text), v_resumo, now())
        ON CONFLICT (usuario_id) DO UPDATE
          SET tipo = EXCLUDED.tipo, payload = EXCLUDED.payload, resumo = EXCLUDED.resumo, criado_em = now();
    END IF;
    RETURN jsonb_build_object('ok', true, 'fase', p_fase, 'resumo', v_resumo);
EXCEPTION
    WHEN raise_exception THEN
        RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Data ou hora inválida.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION laudo_registrar_pelo_bot(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION laudo_registrar_pelo_bot(text, jsonb, text) TO labflow_app;

COMMIT;
