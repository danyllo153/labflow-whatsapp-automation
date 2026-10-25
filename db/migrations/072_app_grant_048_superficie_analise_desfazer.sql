-- Desfaz a 072_app_grant_048_superficie_analise.sql: o app deixa de chamar as funções da 048 e o Coletor volta a
-- registrar baias e linhas (a função volta a ser a da 067). Antes, tire do app as telas que chamam essas funções.

BEGIN;

REVOKE EXECUTE ON FUNCTION
    tab_registrar_foto(bigint, jsonb),
    coliformes_registrar_foto(bigint, jsonb),
    tab_feito_nfc(bigint, jsonb, date, date, boolean)
FROM labflow_app_web;

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

COMMIT;
