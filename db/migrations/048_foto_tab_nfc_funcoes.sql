-- 048 — foto de TAB, foto de Coliformes e TAB de tanque (NFC) por funções do banco (fecha a Fase E no bot)
--
-- Depende da 042 (tanque_exigir_cargo, bot_quem) e da 043. Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 048_foto_tab_nfc_funcoes.sql
-- Desfazer: 048_foto_tab_nfc_funcoes_desfazer.sql (publique antes o workflow que ainda tem o SQL próprio nesses nós).
--
-- Mesmas regras de hoje, o SQL dos nós "BD · TAB da foto", "BD · Coliformes da foto" e "BD · TAB feito NFC" movido para o banco:
--   tab_registrar_foto(quem, linhas)         linhas [{i, id, load, item, lotes, data, acao positivo|negativo}] -> {linhas, nao_achadas}
--   coliformes_registrar_foto(quem, linhas)  acao feito|negativo|positivo; data obrigatória                    -> {linhas, nao_achadas}
--   tab_feito_nfc(quem, grupos, coleta, feito, completo)  grupos ["44"] ou [{tanque, coleta}]; completo só Admin
--                                            -> {sem_coleta, ja_tinham, criados, espalhar_em, coletas_criadas, frascos_novos,
--                                                placas_gravadas, drops_marcados}
-- Admin e Analista (o completo, que registra coleta e análises, só Admin). Erro de regra: exceção em português; as portas do
-- bot (..._pelo_bot) devolvem {ok: false, erro}. SECURITY DEFINER com search_path fixo; o GRANT do app fica com o app.

BEGIN;

CREATE OR REPLACE FUNCTION tab_registrar_foto(p_quem bigint, p_linhas jsonb) RETURNS jsonb AS $$
DECLARE
    v_r jsonb;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
        RAISE EXCEPTION 'Diga as linhas do TAB.';
    END IF;
    WITH u AS (
      SELECT p_quem AS id
    ), l AS (
      SELECT x.*, COALESCE(to_date(NULLIF(x.data, ''), 'DD/MM/YYYY'), CURRENT_DATE) AS dt
      FROM jsonb_to_recordset(p_linhas) AS x(i int, id bigint, "load" text, item text, lotes jsonb, data text, acao text)
    ), r AS (
      SELECT l.*, CASE WHEN l.id IS NOT NULL THEN (SELECT c.id FROM compostas c WHERE c.id = l.id)
                       ELSE composta_por_lotes(l."load", l.item, ARRAY(SELECT y::int FROM jsonb_array_elements_text(l.lotes) AS y)) END AS composta_id
      FROM l
      WHERE l.acao IN ('positivo', 'negativo')
    ), antes AS (
      SELECT r.i, t.id AS teste_id, t.status, t.resultado
      FROM r JOIN testes t ON t.tipo = 'TAB' AND t.composta_id = r.composta_id
    ), ins AS (
      -- composta sem TAB: entra feito na data da linha, espalhado (+5) e lido (+10), já com o resultado
      INSERT INTO testes (tipo, composta_id, status, resultado, data_feito, feito_por, espalhar_prevista, espalhado_em, espalhado_por,
                          leitura_prevista, confirmacao_prevista, confirmacao_em, confirmacao_por, resultado_em, resultado_por)
      SELECT DISTINCT ON (r.composta_id) 'TAB', r.composta_id, 'Concluída',
             CASE r.acao WHEN 'positivo' THEN 'Positivo' ELSE 'Negativo' END,
             r.dt, (SELECT id FROM u), r.dt + 5, (r.dt + 5)::timestamp AT TIME ZONE 'America/Sao_Paulo' + interval '12 hours', (SELECT id FROM u),
             r.dt + 10,
             CASE WHEN r.acao = 'positivo' THEN r.dt + 11 END, CASE WHEN r.acao = 'positivo' THEN now() END,
             CASE WHEN r.acao = 'positivo' THEN (SELECT id FROM u) END,
             now(), (SELECT id FROM u)
      FROM r
      WHERE r.composta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM antes a WHERE a.i = r.i)
      ORDER BY r.composta_id, r.dt
      ON CONFLICT (tipo, composta_id) DO NOTHING
      RETURNING id, composta_id
    ), res AS (
      -- composta que já tinha TAB (no caldo, incubado ou em confirmação): grava o resultado e conclui
      UPDATE testes t
      SET status = 'Concluída',
          resultado = CASE r.acao WHEN 'positivo' THEN 'Positivo' ELSE 'Negativo' END,
          espalhado_em = COALESCE(t.espalhado_em, now()), espalhado_por = COALESCE(t.espalhado_por, (SELECT id FROM u)),
          confirmacao_prevista = CASE WHEN r.acao = 'positivo' THEN COALESCE(t.confirmacao_prevista, CURRENT_DATE) ELSE t.confirmacao_prevista END,
          confirmacao_em = CASE WHEN r.acao = 'positivo' THEN COALESCE(t.confirmacao_em, now()) ELSE t.confirmacao_em END,
          confirmacao_por = CASE WHEN r.acao = 'positivo' THEN COALESCE(t.confirmacao_por, (SELECT id FROM u)) ELSE t.confirmacao_por END,
          resultado_em = now(), resultado_por = (SELECT id FROM u)
      FROM r JOIN antes a ON a.i = r.i
      WHERE t.id = a.teste_id AND a.status IN ('No caldo', 'Incubada', 'Em confirmação')
      RETURNING t.id, t.composta_id
    ), feito AS (
      SELECT r.i, r.acao, r.composta_id, (ins.id IS NOT NULL OR res.id IS NOT NULL) AS gravou, a.resultado AS era,
             v."load", v.lotes, v.item
      FROM r
      LEFT JOIN ins ON ins.composta_id = r.composta_id
      LEFT JOIN antes a ON a.i = r.i
      LEFT JOIN res ON res.id = a.teste_id
      LEFT JOIN vw_compostas v ON v.id = r.composta_id
    )
    SELECT to_jsonb(z) INTO v_r FROM (
    SELECT (SELECT json_agg(json_build_object('i', f.i, 'acao', f.acao, 'composta', f.composta_id, 'gravou', f.gravou, 'era', f.era,
                                              'load', f."load", 'item', f.item, 'lotes', f.lotes) ORDER BY f.i)
            FROM feito f WHERE f.composta_id IS NOT NULL) AS linhas,
           (SELECT json_agg(json_build_object('i', r.i, 'load', r."load", 'lotes', r.lotes, 'id', r.id) ORDER BY r.i)
            FROM r WHERE r.composta_id IS NULL) AS nao_achadas
    ) z;
    RETURN v_r || jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION coliformes_registrar_foto(p_quem bigint, p_linhas jsonb) RETURNS jsonb AS $$
DECLARE
    v_r jsonb;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
        RAISE EXCEPTION 'Diga as linhas dos Coliformes.';
    END IF;
    WITH u AS (
      SELECT p_quem AS id
    ), l AS (
      SELECT x.*, to_date(x.data, 'DD/MM/YYYY') AS dt
      FROM jsonb_to_recordset(p_linhas) AS x(i int, id bigint, "load" text, item text, lotes jsonb, data text, acao text)
    ), r AS (
      SELECT l.*, CASE WHEN l.id IS NOT NULL THEN (SELECT c.id FROM compostas c WHERE c.id = l.id)
                       ELSE composta_por_lotes(l."load", l.item, ARRAY(SELECT y::int FROM jsonb_array_elements_text(l.lotes) AS y)) END AS composta_id
      FROM l
    ), antes AS (
      SELECT r.i, t.id AS teste_id, t.status, t.resultado
      FROM r JOIN testes t ON t.tipo = 'COLIFORMES' AND t.composta_id = r.composta_id
    ), ins AS (
      -- composta sem Coliformes: entra no caldo com a data da linha (e já com o resultado, se a linha trouxe)
      INSERT INTO testes (tipo, composta_id, status, resultado, data_feito, feito_por, espalhar_prevista,
                          espalhado_em, espalhado_por, resultado_em, resultado_por)
      SELECT DISTINCT ON (r.composta_id) 'COLIFORMES', r.composta_id,
             CASE WHEN r.acao = 'feito' THEN 'No caldo' ELSE 'Concluída' END,
             CASE r.acao WHEN 'negativo' THEN 'Negativo' WHEN 'positivo' THEN 'Positivo' END,
             r.dt, (SELECT id FROM u), r.dt + 1,
             CASE WHEN r.acao <> 'feito' THEN now() END, CASE WHEN r.acao <> 'feito' THEN (SELECT id FROM u) END,
             CASE WHEN r.acao <> 'feito' THEN now() END, CASE WHEN r.acao <> 'feito' THEN (SELECT id FROM u) END
      FROM r
      WHERE r.composta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM antes a WHERE a.i = r.i)
      ORDER BY r.composta_id, r.dt
      ON CONFLICT (tipo, composta_id) DO NOTHING
      RETURNING id, composta_id, resultado
    ), res AS (
      -- composta que já tinha Coliformes: grava o resultado (estria e leitura marcadas agora)
      UPDATE testes t
      SET status = 'Concluída',
          resultado = CASE r.acao WHEN 'positivo' THEN 'Positivo' ELSE 'Negativo' END,
          espalhado_em = COALESCE(t.espalhado_em, now()), espalhado_por = COALESCE(t.espalhado_por, (SELECT id FROM u)),
          resultado_em = now(), resultado_por = (SELECT id FROM u)
      FROM r JOIN antes a ON a.i = r.i
      WHERE t.id = a.teste_id AND r.acao IN ('negativo', 'positivo') AND a.status <> 'Em confirmação'
      RETURNING t.id, t.composta_id, t.resultado
    ), feito AS (
      SELECT r.i, r.acao, r.data, r.composta_id,
             COALESCE(ins.id, res.id, a.teste_id) AS teste_id,
             (ins.id IS NOT NULL) AS novo, (res.id IS NOT NULL) AS atualizado, a.resultado AS era,
             v.load, v.lotes, v.rotulo, v.origem
      FROM r
      LEFT JOIN ins ON ins.composta_id = r.composta_id
      LEFT JOIN antes a ON a.i = r.i
      LEFT JOIN res ON res.id = a.teste_id
      LEFT JOIN vw_compostas v ON v.id = r.composta_id
    )
    SELECT to_jsonb(z) INTO v_r FROM (
    SELECT (SELECT json_agg(json_build_object('i', f.i, 'acao', f.acao, 'data', f.data, 'composta', f.composta_id, 'teste', f.teste_id,
                                              'gravou', f.novo OR f.atualizado, 'era', f.era, 'load', f.load, 'lotes', f.lotes,
                                              'rotulo', f.rotulo, 'origem', f.origem) ORDER BY f.i)
            FROM feito f WHERE f.composta_id IS NOT NULL) AS linhas,
           (SELECT json_agg(json_build_object('i', r.i, 'load', r."load", 'lotes', r.lotes, 'id', r.id) ORDER BY r.i)
            FROM r WHERE r.composta_id IS NULL) AS nao_achadas
    ) z;
    RETURN v_r || jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION tab_feito_nfc(p_quem bigint, p_grupos jsonb, p_coleta date, p_feito date, p_completo boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_cargo     text;
    v_coleta    text := to_char(p_coleta, 'DD/MM/YYYY');
    v_feito     text := to_char(p_feito, 'DD/MM/YYYY');
    v_completo  text := CASE WHEN p_completo THEN '1' ELSE '' END;
    v_r         jsonb;
BEGIN
    v_cargo := tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF p_completo AND v_cargo <> 'Admin' THEN
        RAISE EXCEPTION 'Só um Admin registra o TAB de tanque junto com a coleta.';
    END IF;
    IF p_grupos IS NULL OR jsonb_typeof(p_grupos) <> 'array' OR jsonb_array_length(p_grupos) = 0 THEN
        RAISE EXCEPTION 'Diga os tanques.';
    END IF;
    IF p_coleta IS NULL OR p_feito IS NULL THEN
        RAISE EXCEPTION 'Diga a data da coleta e a data do TAB.';
    END IF;
    WITH adm AS (
      SELECT p_quem AS id
    ), dia AS (
      SELECT to_date(v_coleta, 'DD/MM/YYYY') AS coleta, to_date(v_feito, 'DD/MM/YYYY') AS feito
    ), pedidos AS (
      SELECT DISTINCT upper(COALESCE(x ->> 'tanque', x #>> '{}')) AS tanque,
             COALESCE(to_date(x ->> 'coleta', 'DD/MM/YYYY'), (SELECT coleta FROM dia)) AS coleta
      FROM jsonb_array_elements(p_grupos) AS x
    ), multi AS (
      -- mais de uma data de coleta: o nome do tanque leva a data, "39 (coleta 17/10)"
      SELECT count(DISTINCT coleta) > 1 AS m FROM pedidos
    ), existentes AS (
      -- liga cada tanque à coleta exata (tanque de terra + data da coleta)
      SELECT p.tanque, p.coleta, c.id AS coleta_id
      FROM pedidos p
      JOIN coletas c ON c.origem = 'terra' AND c.tanque = p.tanque AND c.data_coleta = p.coleta
    ), novas AS (
      -- "completo" (só Admin): registra a coleta que faltava, com os drops e o arquivo, como o comando de coleta
      INSERT INTO coletas (origem, tanque, data_coleta, registrado_por)
      SELECT 'terra', p.tanque, p.coleta, (SELECT id FROM adm)
      FROM pedidos p
      WHERE v_completo = '1' AND NOT EXISTS (SELECT 1 FROM existentes e WHERE e.tanque = p.tanque AND e.coleta = p.coleta)
      RETURNING id, tanque, data_coleta
    ), drops_novos AS (
      -- drops D5, D10 e D15; os que já venceram até a data do TAB nascem concluídos (mesma regra das leituras)
      INSERT INTO drops (coleta_id, dia, data_prevista, status, concluido_por, concluido_em)
      SELECT n.id, x.dia, n.data_coleta + x.dia,
             CASE WHEN n.data_coleta + x.dia <= (SELECT feito FROM dia) THEN 'Concluído' ELSE 'Pendente' END,
             CASE WHEN n.data_coleta + x.dia <= (SELECT feito FROM dia) THEN (SELECT id FROM adm) END,
             CASE WHEN n.data_coleta + x.dia <= (SELECT feito FROM dia) THEN now() END
      FROM novas n CROSS JOIN (VALUES (5), (10), (15)) AS x(dia)
      RETURNING id, status
    ), arq AS (
      INSERT INTO arquivo_amostras (coleta_id, tipo, data_descarte)
      SELECT id, 'bag', data_coleta + 365 FROM novas
      RETURNING id
    ), col AS (
      -- coleta de cada tanque pedido: a que já existia, a criada agora ou nenhuma (coleta_id nulo)
      SELECT tanque, coleta, coleta_id FROM existentes
      UNION ALL SELECT tanque, data_coleta, id FROM novas
      UNION ALL SELECT p.tanque, p.coleta, NULL::bigint FROM pedidos p
        WHERE NOT EXISTS (SELECT 1 FROM existentes e WHERE e.tanque = p.tanque AND e.coleta = p.coleta)
          AND NOT EXISTS (SELECT 1 FROM novas n WHERE n.tanque = p.tanque AND n.data_coleta = p.coleta)
    ), rot AS (
      SELECT c.*, c.tanque || CASE WHEN (SELECT m FROM multi) THEN ' (coleta ' || to_char(c.coleta, 'DD/MM') || ')' ELSE '' END AS nome
      FROM col c
    ), sem_analise AS (
      -- frasco (normal ou stress) que ainda não tem análise registrada nessa coleta
      SELECT c.coleta_id, c.coleta, f.frasco
      FROM col c CROSS JOIN (VALUES ('Normal'), ('Stress')) AS f(frasco)
      WHERE v_completo = '1' AND c.coleta_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM analises a WHERE a.coleta_id = c.coleta_id AND a.frasco = f.frasco AND a.repeticao_de IS NULL)
    ), nov_an AS (
      -- análises novas (prazos do comando de análise), já no estado certo: lido o que venceu até a data do TAB
      INSERT INTO analises (coleta_id, frasco, sub_analise, metodo, data_analise, pre_leitura_prevista, leitura_final_prevista,
                            status, registrado_por, pre_leitura_por, leitura_final_por)
      SELECT s.coleta_id, s.frasco, l.sub, l.met, s.coleta,
             CASE WHEN l.pre IS NULL THEN NULL ELSE s.coleta + l.pre END,
             s.coleta + l.fin,
             CASE WHEN s.coleta + l.fin <= (SELECT feito FROM dia) THEN 'Concluído'
                  WHEN l.pre IS NOT NULL AND s.coleta + l.pre <= (SELECT feito FROM dia) THEN 'Aguardando Leitura Final'
                  WHEN l.pre IS NULL THEN 'Aguardando Leitura Final'
                  ELSE 'Aguardando Pré-Leitura' END,
             (SELECT id FROM adm),
             CASE WHEN l.pre IS NOT NULL AND s.coleta + l.pre <= (SELECT feito FROM dia) THEN (SELECT id FROM adm) END,
             CASE WHEN s.coleta + l.fin <= (SELECT feito FROM dia) THEN (SELECT id FROM adm) END
      FROM sem_analise s
      CROSS JOIN (VALUES ('CT',   'Profundidade', NULL::int, 2),
                         ('BL',   'Profundidade', 3,         5),
                         ('WORT', 'Profundidade', 5,         10),
                         ('WORT', 'Superficie',   5,         10)) AS l(sub, met, pre, fin)
      RETURNING id, pre_leitura_prevista, leitura_final_prevista
    ), alvo_an AS (
      -- análises que já existiam nessas coletas (sem as repetições)
      SELECT a.id, a.pre_leitura_prevista, a.leitura_final_prevista
      FROM analises a JOIN col c ON c.coleta_id = a.coleta_id
      WHERE v_completo = '1' AND a.repeticao_de IS NULL
    ), todas_an AS (
      SELECT id, pre_leitura_prevista AS pre, leitura_final_prevista AS fin FROM alvo_an
      UNION ALL
      SELECT id, pre_leitura_prevista, leitura_final_prevista FROM nov_an
    ), pl AS (
      -- <1,<1,<1 nas leituras que já venceram até a data do TAB; o que ainda não chegou na data fica sem marcar
      INSERT INTO leituras_placas (analise_id, etapa, placa, sinal, valor, origem, lido_por)
      SELECT t.id, e.etapa, g.p, '<', 1, 'automatico', (SELECT id FROM adm)
      FROM todas_an t
      CROSS JOIN LATERAL (VALUES ('pre', t.pre), ('final', t.fin)) AS e(etapa, prevista)
      CROSS JOIN generate_series(1, 3) AS g(p)
      WHERE e.prevista IS NOT NULL AND e.prevista <= (SELECT feito FROM dia)
      ON CONFLICT (analise_id, etapa, placa) DO NOTHING
      RETURNING analise_id
    ), upd AS (
      -- análises que já existiam: só avança o status (nunca volta) e registra quem leu
      UPDATE analises a
      SET status = CASE WHEN a.leitura_final_prevista <= (SELECT feito FROM dia) THEN 'Concluído'
                        WHEN a.pre_leitura_prevista IS NOT NULL AND a.pre_leitura_prevista <= (SELECT feito FROM dia) THEN 'Aguardando Leitura Final'
                        ELSE a.status END,
          pre_leitura_por = CASE WHEN a.pre_leitura_prevista IS NOT NULL AND a.pre_leitura_prevista <= (SELECT feito FROM dia)
                                 THEN COALESCE(a.pre_leitura_por, (SELECT id FROM adm)) ELSE a.pre_leitura_por END,
          leitura_final_por = CASE WHEN a.leitura_final_prevista <= (SELECT feito FROM dia)
                                   THEN COALESCE(a.leitura_final_por, (SELECT id FROM adm)) ELSE a.leitura_final_por END
      WHERE a.id IN (SELECT id FROM alvo_an) AND a.status <> 'Concluído'
      RETURNING a.id
    ), drops_up AS (
      -- coletas que já existiam: marca como feitos os drops pendentes que já venceram até a data do TAB
      UPDATE drops d SET status = 'Concluído', concluido_por = (SELECT id FROM adm), concluido_em = now()
      WHERE v_completo = '1' AND d.status = 'Pendente'
        AND d.coleta_id IN (SELECT coleta_id FROM existentes)
        AND d.data_prevista <= (SELECT feito FROM dia)
      RETURNING d.id
    ), faltam AS (
      SELECT string_agg(nome, ', ' ORDER BY coleta, length(tanque), tanque) AS lista FROM rot WHERE coleta_id IS NULL
    ), ja AS (
      SELECT string_agg(r.nome, ', ' ORDER BY r.coleta, length(r.tanque), r.tanque) AS lista
      FROM rot r JOIN testes t ON t.coleta_id = r.coleta_id AND t.tipo = 'TAB'
    ), ins AS (
      INSERT INTO testes (tipo, coleta_id, status, data_feito, feito_por, espalhar_prevista)
      SELECT 'TAB', c.coleta_id, 'No caldo', to_date(v_feito, 'DD/MM/YYYY'),
             (SELECT id FROM adm),
             to_date(v_feito, 'DD/MM/YYYY') + 5
      FROM col c
      WHERE (SELECT lista FROM faltam) IS NULL
        AND NOT EXISTS (SELECT 1 FROM testes t WHERE t.tipo = 'TAB' AND t.coleta_id = c.coleta_id)
      RETURNING coleta_id
    )
    SELECT to_jsonb(z) INTO v_r FROM (
    SELECT (SELECT lista FROM faltam) AS sem_coleta,
           (SELECT lista FROM ja) AS ja_tinham,
           (SELECT json_agg(r.nome ORDER BY r.coleta, length(r.tanque), r.tanque)
              FROM rot r WHERE r.coleta_id IN (SELECT coleta_id FROM ins)) AS criados,
           to_char(to_date(v_feito, 'DD/MM/YYYY') + 5, 'DD/MM/YYYY') AS espalhar_em,
           (SELECT string_agg(n.tanque || CASE WHEN (SELECT m FROM multi) THEN ' (coleta ' || to_char(n.data_coleta, 'DD/MM') || ')' ELSE '' END,
                              ', ' ORDER BY n.data_coleta, length(n.tanque), n.tanque) FROM novas n) AS coletas_criadas,
           (SELECT count(*) FROM sem_analise) AS frascos_novos,
           (SELECT count(*) FROM pl) AS placas_gravadas,
           (SELECT count(*) FROM drops_novos WHERE status = 'Concluído') + (SELECT count(*) FROM drops_up) AS drops_marcados
    ) z;
    RETURN v_r || jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- portas de entrada do bot ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tab_foto_pelo_bot(p_telefone text, p_linhas jsonb) RETURNS jsonb AS $$
BEGIN
    RETURN tab_registrar_foto(bot_quem(p_telefone), p_linhas);
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN RETURN jsonb_build_object('ok', false, 'erro', 'Linha inválida.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION coliformes_foto_pelo_bot(p_telefone text, p_linhas jsonb) RETURNS jsonb AS $$
BEGIN
    RETURN coliformes_registrar_foto(bot_quem(p_telefone), p_linhas);
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN RETURN jsonb_build_object('ok', false, 'erro', 'Linha inválida.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION tab_feito_nfc_pelo_bot(p_telefone text, p_grupos jsonb, p_coleta text, p_feito text, p_completo text DEFAULT '')
RETURNS jsonb AS $$
BEGIN
    RETURN tab_feito_nfc(bot_quem(p_telefone), p_grupos, to_date(p_coleta, 'DD/MM/YYYY'), to_date(p_feito, 'DD/MM/YYYY'), p_completo = '1');
EXCEPTION
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN RETURN jsonb_build_object('ok', false, 'erro', 'Data inválida.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION tab_registrar_foto(bigint, jsonb), coliformes_registrar_foto(bigint, jsonb),
                       tab_feito_nfc(bigint, jsonb, date, date, boolean), tab_foto_pelo_bot(text, jsonb),
                       coliformes_foto_pelo_bot(text, jsonb), tab_feito_nfc_pelo_bot(text, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tab_registrar_foto(bigint, jsonb), coliformes_registrar_foto(bigint, jsonb),
                          tab_feito_nfc(bigint, jsonb, date, date, boolean), tab_foto_pelo_bot(text, jsonb),
                          coliformes_foto_pelo_bot(text, jsonb), tab_feito_nfc_pelo_bot(text, jsonb, text, text, text) TO labflow_app;

COMMIT;
