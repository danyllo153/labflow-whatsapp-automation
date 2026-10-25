-- 072 — app: o app chama as funções da 048 do bot e o Coletor deixa de registrar baias e linhas
--
-- Faixa do app (050–099). Pedidos da sessão do bot de 25/10 (backlog.md). Tarefa: APP-063. Desfazer:
-- 072_app_grant_048_superficie_analise_desfazer.sql. Aplicar com o administrador do banco, depois de um backup.
--
-- 1. GRANT ao labflow_app_web das funções da 048 que recebem a pessoa (p_quem): foto de TAB e de Coliformes e o TAB de
--    tanque "completo". As "..._pelo_bot" (pelo telefone) ficam só com o bot, como na 069.
-- 2. Baias e linhas são ANÁLISE, não coleta (decisão do Danyllo de 25/10): só Admin e Analista registram. A função da
--    067 deixa de aceitar o Coletor (o bot já barra na 100; a tela e a API do app também, no mesmo PR). Só muda a
--    lista de cargos; o resto da função é o da 067.

BEGIN;

GRANT EXECUTE ON FUNCTION
    tab_registrar_foto(bigint, jsonb),
    coliformes_registrar_foto(bigint, jsonb),
    tab_feito_nfc(bigint, jsonb, date, date, boolean)
TO labflow_app_web;

CREATE OR REPLACE FUNCTION app.bot_coletar_superficie(
    p_quem bigint, p_tipo text, p_pontos text[], p_quando timestamptz DEFAULT now(), p_analisada_em date DEFAULT NULL,
    p_observacao text DEFAULT NULL
) RETURNS SETOF app.coletas_superficie AS $$
DECLARE
    v_dia date := (p_quando AT TIME ZONE 'America/Sao_Paulo')::date;
    v_analise date := coalesce(p_analisada_em, (p_quando AT TIME ZONE 'America/Sao_Paulo')::date);
    v_ponto text;
BEGIN
    PERFORM app.bot_exigir(p_quem, ARRAY['Admin', 'Analista']);
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

COMMIT;
