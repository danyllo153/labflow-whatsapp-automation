-- 067 — app: funções do banco para o bot gravar esterilização (PB8) e águas, baias e linhas (PB9) por frase
--
-- Faixa do app (050–099). Spec: rumo-do-app.md, pedidos PB8 e PB9. Tarefa: APP-054. Depende da 054, 058, 059, 061 e 062.
-- Desfazer: 067_app_funcoes_bot_esterilizacao_aguas_desfazer.sql. Aplicar com o administrador do banco, depois de um backup.
--
-- O bot (n8n, papel labflow_app) chama estas funções em vez de escrever nas tabelas do app, para valer a MESMA regra do app:
--   app.bot_registrar_esterilizacao(quem, tipos[], ciclo, meio, descricao, quando)
--       um ou mais materiais do mesmo ciclo ("meio de cultura e frascos, ciclo A1092/26") -> uma linha por material, todas na
--       mesma linha do laudo (mesmo dia + ciclo); eficiente Sim por padrão; ciclo digitado pela pessoa (sem sugestão).
--   app.bot_coletar_agua(quem, pontos[], quando, observacao)       -> coleta da água do processo (manifold, camara4..6).
--   app.bot_lancar_agua(quem, ct jsonb, bl jsonb, coleta_id)       -> C.T./B.L. por ponto ({"todos": "<1"} vale para os coletados);
--       sem coleta_id: a coleta mais recente que ainda espera resultado.
--   app.bot_coletar_superficie(quem, tipo, pontos[], quando, analisada_em, observacao) -> baias ou linhas (uma linha por ponto).
--   app.bot_lancar_superficie(quem, tipo, ponto, campos jsonb, coleta_id) -> {"ct_48","bl_72","bl_120"}; sem coleta_id: a coleta
--       mais recente daquele ponto ainda sem o resultado pedido.
-- Resultado: "<1", ">300", número (vírgula ou ponto) ou "-"; espaços somem ("< 1" vira "<1"); vazio apaga a leitura.
-- Quem pode (conferido AQUI, como no app): esterilização e resultados = Admin e Analista; coletas = Admin, Analista e Coletor.
-- O turno e o dia saem da entrada aberta da pessoa no app; sem entrada, do horário (Manhã 08–16, Tarde 16–00, Madrugada 00–08,
-- a Madrugada contando no dia em que começou). As páginas dos laudos usam as MESMAS travas do app (advisory lock 58 e 60).
-- Funções SECURITY DEFINER com search_path fixo; o EXECUTE vai para o labflow_app (bot) e o labflow_app_web (app).

BEGIN;

CREATE OR REPLACE FUNCTION app.bot_exigir(p_quem bigint, p_cargos text[]) RETURNS void AS $$
DECLARE
    v_cargo text;
BEGIN
    SELECT cargo INTO v_cargo FROM usuarios WHERE id = p_quem;
    IF v_cargo IS NULL THEN
        RAISE EXCEPTION 'Pessoa não encontrada.';
    END IF;
    IF NOT v_cargo = ANY (p_cargos) THEN
        RAISE EXCEPTION 'Seu cargo (%) não pode fazer este registro.', v_cargo;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = app, public, pg_temp;

-- "< 1" -> "<1"; vazio -> NULL (ainda não lido); fora do formato: erro com a mensagem do app.
CREATE OR REPLACE FUNCTION app.bot_resultado(p_valor text) RETURNS text AS $$
DECLARE
    v text := regexp_replace(coalesce(p_valor, ''), '\s+', '', 'g');
BEGIN
    IF v = '' THEN
        RETURN NULL;
    END IF;
    IF length(v) > 10 OR v !~ '^([<>]?[0-9]+([.,][0-9]+)?|-)$' THEN
        RAISE EXCEPTION 'Resultado inválido: %. Use <1 ou um número.', trim(p_valor);
    END IF;
    RETURN v;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = app, public, pg_temp;

-- O turno (id) e o dia dele para a pessoa: a entrada aberta no app (se o turno ainda não acabou) ou o turno do horário.
CREATE OR REPLACE FUNCTION app.bot_turno(p_quem bigint, p_quando timestamptz, OUT turno_id smallint, OUT dia date) AS $$
DECLARE
    v_local timestamp := p_quando AT TIME ZONE 'America/Sao_Paulo';
    v_hoje date := v_local::date;
    r record;
    d date;
BEGIN
    SELECT e.turno_id, e.dia INTO turno_id, dia
    FROM app.entradas_turno e JOIN app.turnos t ON t.id = e.turno_id
    WHERE e.usuario_id = p_quem AND e.saida IS NULL
      AND v_local < (e.dia + t.fim) + CASE WHEN t.fim <= t.inicio THEN interval '1 day' ELSE interval '0' END
    ORDER BY e.entrada DESC LIMIT 1;
    IF FOUND THEN
        RETURN;
    END IF;
    FOREACH d IN ARRAY ARRAY[v_hoje, v_hoje - 1] LOOP
        FOR r IN SELECT id, inicio, fim FROM app.turnos ORDER BY ordem LOOP
            IF (v_local >= d + r.inicio
               AND v_local < (d + r.fim) + (CASE WHEN r.fim <= r.inicio THEN interval '1 day' ELSE interval '0' END)) THEN
                turno_id := r.id;
                dia := d;
                RETURN;
            END IF;
        END LOOP;
    END LOOP;
    RAISE EXCEPTION 'Os turnos não cobrem este horário.';
END;
$$ LANGUAGE plpgsql STABLE SET search_path = app, public, pg_temp;

-- Página do laudo de esterilização (a mesma regra de laudo_esterilizacao.atribuir_pagina: o mesmo ciclo do dia fica na mesma
-- linha; senão a primeira página não impressa com vaga, 35 linhas = pares dia + ciclo).
CREATE OR REPLACE FUNCTION app.bot_pagina_esterilizacao(p_dia date, p_ciclo text) RETURNS bigint AS $$
DECLARE
    v_id bigint;
BEGIN
    PERFORM pg_advisory_xact_lock(58);
    SELECT e.laudo_id INTO v_id FROM app.esterilizacoes e JOIN app.laudos_esterilizacao l ON l.id = e.laudo_id
    WHERE e.excluida_em IS NULL AND e.dia = p_dia AND lower(trim(e.ciclo)) = lower(trim(p_ciclo)) AND l.impresso_em IS NULL
    ORDER BY e.id LIMIT 1;
    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;
    SELECT l.id INTO v_id FROM app.laudos_esterilizacao l
    WHERE l.impresso_em IS NULL AND (
        SELECT count(*) FROM (
            SELECT 1 FROM app.esterilizacoes e WHERE e.laudo_id = l.id AND e.excluida_em IS NULL GROUP BY e.dia, lower(trim(e.ciclo))
        ) x
    ) < 35
    ORDER BY l.id LIMIT 1;
    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;
    INSERT INTO app.laudos_esterilizacao DEFAULT VALUES RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SET search_path = app, public, pg_temp;

-- Página dos laudos de águas (a mesma regra de laudos.pagina_com_vaga: a primeira não impressa com vaga; mesma trava).
CREATE OR REPLACE FUNCTION app.bot_pagina_aguas(p_laudo text) RETURNS bigint AS $$
DECLARE
    v_id bigint;
    v_capacidade int := CASE WHEN p_laudo = 'agua-processo' THEN 23 ELSE 31 END;
    v_linhas int;
BEGIN
    PERFORM pg_advisory_xact_lock(60, hashtext(p_laudo));
    FOR v_id IN SELECT id FROM app.paginas_laudo WHERE laudo = p_laudo AND impresso_em IS NULL ORDER BY id LOOP
        IF p_laudo = 'agua-processo' THEN
            SELECT count(*) INTO v_linhas FROM app.coletas_agua_processo WHERE pagina_id = v_id AND excluida_em IS NULL;
        ELSE
            SELECT count(*) INTO v_linhas FROM app.coletas_superficie WHERE pagina_id = v_id AND excluida_em IS NULL;
        END IF;
        IF v_linhas < v_capacidade THEN
            RETURN v_id;
        END IF;
    END LOOP;
    INSERT INTO app.paginas_laudo (laudo) VALUES (p_laudo) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SET search_path = app, public, pg_temp;

-- PB8 ---------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.bot_registrar_esterilizacao(
    p_quem bigint, p_tipos text[], p_ciclo text, p_meio text DEFAULT NULL, p_descricao text DEFAULT NULL,
    p_quando timestamptz DEFAULT now()
) RETURNS SETOF app.esterilizacoes AS $$
DECLARE
    v_ciclo text := trim(coalesce(p_ciclo, ''));
    v_turno smallint;
    v_dia date;
    v_pagina bigint;
    v_tipo text;
BEGIN
    PERFORM app.bot_exigir(p_quem, ARRAY['Admin', 'Analista']);
    IF v_ciclo = '' THEN
        RAISE EXCEPTION 'Informe o número do ciclo.';
    END IF;
    IF coalesce(cardinality(p_tipos), 0) = 0 THEN
        RAISE EXCEPTION 'Diga o que foi esterilizado (ponteira, meio de cultura, frasco, água de diluição, descarte ou outro).';
    END IF;
    FOREACH v_tipo IN ARRAY p_tipos LOOP
        IF v_tipo NOT IN ('Ponteira', 'Meio', 'Frasco', 'Água de diluição', 'Descarte', 'Outro') THEN
            RAISE EXCEPTION 'Material desconhecido: %.', v_tipo;
        END IF;
        IF v_tipo = 'Outro' AND nullif(trim(p_descricao), '') IS NULL THEN
            RAISE EXCEPTION 'Descreva o que foi esterilizado (tipo Outro).';
        END IF;
    END LOOP;
    SELECT t.turno_id, t.dia INTO v_turno, v_dia FROM app.bot_turno(p_quem, p_quando) t;
    v_pagina := app.bot_pagina_esterilizacao(v_dia, v_ciclo);
    FOREACH v_tipo IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(p_tipos) x) LOOP
        RETURN QUERY
        INSERT INTO app.esterilizacoes (tipo, ciclo, meio, descricao, turno_id, dia, feita_por, feita_em, laudo_id)
        VALUES (
            v_tipo, v_ciclo,
            CASE WHEN v_tipo = 'Meio' THEN nullif(trim(p_meio), '') END,
            CASE WHEN v_tipo = 'Outro' THEN trim(p_descricao) END,
            v_turno, v_dia, p_quem, p_quando, v_pagina
        )
        RETURNING *;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public, pg_temp;

-- PB9: água do processo ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.bot_coletar_agua(
    p_quem bigint, p_pontos text[], p_quando timestamptz DEFAULT now(), p_observacao text DEFAULT NULL
) RETURNS app.coletas_agua_processo AS $$
DECLARE
    v_linha app.coletas_agua_processo;
    v_ponto text;
BEGIN
    PERFORM app.bot_exigir(p_quem, ARRAY['Admin', 'Analista', 'Coletor']);
    IF coalesce(cardinality(p_pontos), 0) = 0 THEN
        RAISE EXCEPTION 'Diga os pontos coletados (Manifold, Câmara 4, 5 ou 6).';
    END IF;
    FOREACH v_ponto IN ARRAY p_pontos LOOP
        IF v_ponto NOT IN ('manifold', 'camara4', 'camara5', 'camara6') THEN
            RAISE EXCEPTION 'Ponto desconhecido: %.', v_ponto;
        END IF;
    END LOOP;
    IF p_quando > now() + interval '5 minutes' THEN
        RAISE EXCEPTION 'A coleta não pode ser no futuro.';
    END IF;
    INSERT INTO app.coletas_agua_processo (coletada_em, manifold, camara4, camara5, camara6, observacao, coletada_por, pagina_id)
    VALUES (
        p_quando, 'manifold' = ANY (p_pontos), 'camara4' = ANY (p_pontos), 'camara5' = ANY (p_pontos), 'camara6' = ANY (p_pontos),
        nullif(trim(p_observacao), ''), p_quem, app.bot_pagina_aguas('agua-processo')
    )
    RETURNING * INTO v_linha;
    RETURN v_linha;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public, pg_temp;

CREATE OR REPLACE FUNCTION app.bot_lancar_agua(
    p_quem bigint, p_ct jsonb DEFAULT '{}', p_bl jsonb DEFAULT '{}', p_coleta_id bigint DEFAULT NULL
) RETURNS app.coletas_agua_processo AS $$
DECLARE
    v_linha app.coletas_agua_processo;
    v_ponto text;
    v_coletado boolean;
    v_tipo text;
    v_valores jsonb;
    v_valor text;
BEGIN
    PERFORM app.bot_exigir(p_quem, ARRAY['Admin', 'Analista']);
    IF p_coleta_id IS NULL THEN
        SELECT * INTO v_linha FROM app.coletas_agua_processo
        WHERE excluida_em IS NULL AND (
            (manifold AND (ct_manifold IS NULL OR bl_manifold IS NULL)) OR (camara4 AND (ct_camara4 IS NULL OR bl_camara4 IS NULL))
            OR (camara5 AND (ct_camara5 IS NULL OR bl_camara5 IS NULL)) OR (camara6 AND (ct_camara6 IS NULL OR bl_camara6 IS NULL))
        )
        ORDER BY coletada_em DESC, id DESC LIMIT 1 FOR UPDATE;
    ELSE
        SELECT * INTO v_linha FROM app.coletas_agua_processo WHERE id = p_coleta_id AND excluida_em IS NULL FOR UPDATE;
    END IF;
    IF v_linha.id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma coleta da água do processo esperando resultado.';
    END IF;
    FOREACH v_tipo IN ARRAY ARRAY['ct', 'bl'] LOOP
        v_valores := CASE WHEN v_tipo = 'ct' THEN coalesce(p_ct, '{}') ELSE coalesce(p_bl, '{}') END;
        FOREACH v_ponto IN ARRAY ARRAY['manifold', 'camara4', 'camara5', 'camara6'] LOOP
            v_coletado := CASE v_ponto WHEN 'manifold' THEN v_linha.manifold WHEN 'camara4' THEN v_linha.camara4
                                       WHEN 'camara5' THEN v_linha.camara5 ELSE v_linha.camara6 END;
            IF v_valores ? v_ponto THEN
                IF NOT v_coletado THEN
                    RAISE EXCEPTION 'O ponto % não foi coletado nessa coleta.', v_ponto;
                END IF;
                v_valor := v_valores ->> v_ponto;
            ELSIF v_valores ? 'todos' AND v_coletado THEN
                v_valor := v_valores ->> 'todos';
            ELSE
                CONTINUE;
            END IF;
            EXECUTE format('UPDATE app.coletas_agua_processo SET %I = $1 WHERE id = $2', v_tipo || '_' || v_ponto)
                USING app.bot_resultado(v_valor), v_linha.id;
        END LOOP;
    END LOOP;
    UPDATE app.coletas_agua_processo SET resultado_por = p_quem, resultado_em = clock_timestamp() WHERE id = v_linha.id
    RETURNING * INTO v_linha;
    RETURN v_linha;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public, pg_temp;

-- PB9: baias e linhas -----------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.bot_coletar_superficie(
    p_quem bigint, p_tipo text, p_pontos text[], p_quando timestamptz DEFAULT now(), p_analisada_em date DEFAULT NULL,
    p_observacao text DEFAULT NULL
) RETURNS SETOF app.coletas_superficie AS $$
DECLARE
    v_dia date := (p_quando AT TIME ZONE 'America/Sao_Paulo')::date;
    v_analise date := coalesce(p_analisada_em, (p_quando AT TIME ZONE 'America/Sao_Paulo')::date);
    v_ponto text;
BEGIN
    PERFORM app.bot_exigir(p_quem, ARRAY['Admin', 'Analista', 'Coletor']);
    IF p_tipo NOT IN ('Baia', 'Linha') THEN
        RAISE EXCEPTION 'Tipo desconhecido: % (use Baia ou Linha).', p_tipo;
    END IF;
    IF v_analise < v_dia OR v_analise - v_dia > 3 THEN
        RAISE EXCEPTION 'O dia da análise deve ser o da coleta ou até 3 dias depois.';
    END IF;
    IF coalesce(cardinality(p_pontos), 0) = 0 THEN
        RAISE EXCEPTION 'Informe o número da %.', lower(p_tipo);
    END IF;
    FOREACH v_ponto IN ARRAY p_pontos LOOP
        v_ponto := trim(regexp_replace(upper(trim(v_ponto)), '^' || upper(p_tipo), ''));
        IF v_ponto = '' OR length(v_ponto) > 10 THEN
            RAISE EXCEPTION 'Informe o número da %.', lower(p_tipo);
        END IF;
        IF p_tipo = 'Baia' AND v_ponto ~ '^[0-9]+$' THEN
            v_ponto := lpad(v_ponto, 2, '0');   -- como o app: baia 8 vira "08"
        END IF;
        RETURN QUERY
        INSERT INTO app.coletas_superficie (tipo, ponto, coletada_em, analisada_em, observacao, coletada_por, pagina_id)
        VALUES (p_tipo, v_ponto, p_quando, v_analise, nullif(trim(p_observacao), ''), p_quem, app.bot_pagina_aguas('superficies-' || p_tipo))
        RETURNING *;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public, pg_temp;

CREATE OR REPLACE FUNCTION app.bot_lancar_superficie(
    p_quem bigint, p_tipo text, p_ponto text, p_campos jsonb, p_coleta_id bigint DEFAULT NULL
) RETURNS app.coletas_superficie AS $$
DECLARE
    v_linha app.coletas_superficie;
    v_ponto text := trim(regexp_replace(upper(trim(coalesce(p_ponto, ''))), '^' || upper(coalesce(p_tipo, '')), ''));
    v_campo text;
BEGIN
    PERFORM app.bot_exigir(p_quem, ARRAY['Admin', 'Analista']);
    IF p_campos IS NULL OR NOT (p_campos ?| ARRAY['ct_48', 'bl_72', 'bl_120']) THEN
        RAISE EXCEPTION 'Diga qual leitura: C.T. 48h, B.L. 72h ou B.L. 120h.';
    END IF;
    IF p_tipo = 'Baia' AND v_ponto ~ '^[0-9]+$' THEN
        v_ponto := lpad(v_ponto, 2, '0');
    END IF;
    IF p_coleta_id IS NULL THEN
        SELECT * INTO v_linha FROM app.coletas_superficie c
        WHERE c.excluida_em IS NULL AND c.tipo = p_tipo AND c.ponto = v_ponto
          AND ((p_campos ? 'ct_48' AND c.ct_48 IS NULL) OR (p_campos ? 'bl_72' AND c.bl_72 IS NULL) OR (p_campos ? 'bl_120' AND c.bl_120 IS NULL))
        ORDER BY c.coletada_em DESC, c.id DESC LIMIT 1 FOR UPDATE;
    ELSE
        SELECT * INTO v_linha FROM app.coletas_superficie WHERE id = p_coleta_id AND excluida_em IS NULL FOR UPDATE;
    END IF;
    IF v_linha.id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma coleta da % % esperando esse resultado.', lower(coalesce(p_tipo, '')), v_ponto;
    END IF;
    FOREACH v_campo IN ARRAY ARRAY['ct_48', 'bl_72', 'bl_120'] LOOP
        IF p_campos ? v_campo THEN
            EXECUTE format('UPDATE app.coletas_superficie SET %I = $1 WHERE id = $2', v_campo)
                USING app.bot_resultado(p_campos ->> v_campo), v_linha.id;
        END IF;
    END LOOP;
    UPDATE app.coletas_superficie SET resultado_por = p_quem, resultado_em = clock_timestamp() WHERE id = v_linha.id
    RETURNING * INTO v_linha;
    RETURN v_linha;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public, pg_temp;

-- quem chama: o bot (labflow_app) e o app (labflow_app_web); ninguém mais
REVOKE ALL ON FUNCTION app.bot_exigir(bigint, text[]), app.bot_resultado(text), app.bot_turno(bigint, timestamptz),
    app.bot_pagina_esterilizacao(date, text), app.bot_pagina_aguas(text),
    app.bot_registrar_esterilizacao(bigint, text[], text, text, text, timestamptz),
    app.bot_coletar_agua(bigint, text[], timestamptz, text), app.bot_lancar_agua(bigint, jsonb, jsonb, bigint),
    app.bot_coletar_superficie(bigint, text, text[], timestamptz, date, text),
    app.bot_lancar_superficie(bigint, text, text, jsonb, bigint) FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO labflow_app;
GRANT EXECUTE ON FUNCTION app.bot_registrar_esterilizacao(bigint, text[], text, text, text, timestamptz),
    app.bot_coletar_agua(bigint, text[], timestamptz, text), app.bot_lancar_agua(bigint, jsonb, jsonb, bigint),
    app.bot_coletar_superficie(bigint, text, text[], timestamptz, date, text),
    app.bot_lancar_superficie(bigint, text, text, jsonb, bigint) TO labflow_app, labflow_app_web;

COMMIT;
