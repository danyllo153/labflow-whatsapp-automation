-- 109 — bot: data inicial da caixa de navio (PB24)
--
-- Pedido do Danyllo de 01/11/2026 (docs/specs/lims/rumo-do-app.md, PB24). A guarda continua 1 ano para o pote de NFC e 2 anos
-- para o FCOJ; o que muda é de onde se conta. A data inicial da caixa é a última amostra daquele navio e viagem (a última coleta
-- de tanque ou a última amostra do embarque, a que for mais tarde) mais 5 dias, e anda junto enquanto chegam amostras. Como o
-- sistema não sabe qual foi a última, Admin e Analista podem fixar a data à mão; apagar volta à automática.
-- A linha "carga" (caixa que veio da planilha) continua com a data da planilha, que não diz o que é pote e o que é FCOJ.
-- arquivo_descartar não muda: ela já lê vw_arquivo_caixas e vw_arquivo_itens. arquivo_consulta e arquivo_pelo_bot são refeitas
-- iguais às que estão no ar, só com a data inicial.
-- Faixa do bot (100–149). Desfazer: 109_data_inicial_caixa_navio_desfazer.sql. Aplicar com o administrador do banco, depois de
-- um backup:
--   psql -U $POSTGRES_USER -d labflow -v ON_ERROR_STOP=1 -f 109_data_inicial_caixa_navio.sql

BEGIN;

ALTER TABLE arquivo_navios
    ADD COLUMN inicio_manual     date,                       -- a data inicial escolhida à mão; vazia = a automática
    ADD COLUMN inicio_manual_por bigint REFERENCES usuarios (id),
    ADD COLUMN inicio_manual_em  timestamptz;

-- a última amostra de cada navio e viagem e a data inicial automática ------------------------------------------------------
CREATE VIEW vw_arquivo_inicio_navio AS
SELECT x.navio_id, max(x.dia) AS ultima_amostra, max(x.dia) + 5 AS inicio_auto
FROM (SELECT c.navio_id, c.data_coleta AS dia FROM coletas c WHERE c.navio_id IS NOT NULL
      UNION ALL
      SELECT e.navio_id, ea.data_embarque FROM embarque_amostras ea JOIN embarques e ON e.id = ea.embarque_id) x
GROUP BY x.navio_id;

-- uma linha por item (pote e FCOJ do navio contam da data inicial da caixa) do arquivo -------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_arquivo_itens AS
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
itens AS (
    -- bags do tanque terra: caixa = número do tanque
    SELECT 'tanque'::text AS caixa_tipo, k.numero AS caixa, 'bag'::text AS item, a.id AS ref_id,
           'tanque ' || c.tanque AS descricao, NULL::text AS navio, NULL::text AS viagem, c.tanque, NULL::text AS load,
           NULL::text AS lotes, 1 AS quantidade, c.data_coleta AS data_ref, a.data_descarte,
           a.status = 'Descartado' AS descartado, a.descartado_em
    FROM arquivo_amostras a
    JOIN coletas c ON c.id = a.coleta_id
    LEFT JOIN arquivo_caixas k ON k.tipo = 'tanque' AND c.tanque ~ '^\d{1,4}$' AND k.numero = c.tanque::int
    WHERE a.tipo = 'bag'
    UNION ALL
    -- potes de NFC do navio: um por tanque do navio, na caixa do navio e viagem
    SELECT 'navio', an.caixa, 'pote', a.id, 'NFC tanque ' || c.tanque, n.nome, n.viagem, c.tanque, NULL, NULL, 1,
           c.data_coleta, (COALESCE(an.inicio_manual, u.inicio_auto) + interval '1 year')::date,
           a.status = 'Descartado' OR an.descartado_em IS NOT NULL,
           COALESCE(a.descartado_em, an.descartado_em)
    FROM arquivo_amostras a
    JOIN coletas c ON c.id = a.coleta_id
    JOIN navios n ON n.id = c.navio_id
    LEFT JOIN arquivo_navios an ON an.navio_id = n.id
    LEFT JOIN vw_arquivo_inicio_navio u ON u.navio_id = n.id
    WHERE a.tipo = 'pote'
    UNION ALL
    -- FCOJ do embarque: uma linha por linha e fase (os loads juntos, a quantidade de amostras), 2 anos
    SELECT 'navio', an.caixa, 'fcoj', e.id, 'FCOJ linha ' || e.linha || ' fase ' || e.fase, n.nome, n.viagem, NULL,
           COALESCE((SELECT string_agg(l.numero, '/' ORDER BY el.principal DESC, l.numero) FROM embarque_loads el
                     JOIN loads l ON l.id = el.load_id WHERE el.embarque_id = e.id),
                    (SELECT string_agg(DISTINCT l.numero, '/') FROM embarque_amostras ea JOIN loads l ON l.id = ea.load_id
                     WHERE ea.embarque_id = e.id)),
           NULL, s.qtd, s.dia, (COALESCE(an.inicio_manual, u.inicio_auto) + interval '2 years')::date, an.descartado_em IS NOT NULL,
           an.descartado_em
    FROM embarques e
    JOIN navios n ON n.id = e.navio_id
    JOIN LATERAL (SELECT count(*)::int AS qtd, min(ea.data_embarque) AS dia FROM embarque_amostras ea
                  WHERE ea.embarque_id = e.id) s ON s.qtd > 0
    LEFT JOIN arquivo_navios an ON an.navio_id = n.id
    LEFT JOIN vw_arquivo_inicio_navio u ON u.navio_id = n.id
    UNION ALL
    -- caixas da carga inicial (planilha): só navio, viagem e a data de descarte
    SELECT 'navio', an.caixa, 'carga', an.id, 'carga inicial', an.navio, an.viagem, NULL, NULL, NULL, NULL,
           NULL, an.descarte_carga, an.descartado_em IS NOT NULL, an.descartado_em
    FROM arquivo_navios an
    WHERE an.origem = 'carga'
    UNION ALL
    -- recebimento: load e lotes, 7 dias depois de arquivado
    SELECT 'recebimento', r.caixa, 'recebimento', r.id, 'load ' || l.numero, NULL, NULL, NULL, l.numero,
           lista_compacta(r.lotes), cardinality(r.lotes), r.data_arquivada, r.data_descarte, r.descartado_em IS NOT NULL,
           r.descartado_em
    FROM arquivo_recebimento r
    JOIN loads l ON l.id = r.load_id
)
SELECT i.caixa_tipo, i.caixa, i.item, i.ref_id, i.descricao, i.navio, i.viagem, i.tanque, i.load, i.lotes, i.quantidade,
       i.data_ref, i.data_descarte,
       CASE WHEN i.descartado THEN 'Descartado' WHEN i.data_descarte <= (SELECT d FROM hoje) THEN 'Vencido' ELSE 'Arquivado' END
           AS situacao,
       i.descartado_em
FROM itens i;

-- uma linha por caixa -----------------------------------------------------------------------------------------------------
-- navio: vence só quando tudo da caixa venceu (a maior data); recebimento e tanque: vence o que passou da data (a menor)
CREATE OR REPLACE VIEW vw_arquivo_caixas AS
SELECT k.tipo, k.numero, k.familia, an.navio, an.viagem,
       COALESCE(s.itens, 0) AS itens_arquivados,
       COALESCE(s.amostras, 0) AS amostras,
       CASE WHEN k.tipo = 'navio' THEN s.maior ELSE s.menor END AS descarte_em,
       CASE WHEN COALESCE(s.itens, 0) = 0 AND an.id IS NULL THEN 'Disponível'
            WHEN k.tipo = 'navio' AND s.maior <= (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'Vencida'
            WHEN k.tipo <> 'navio' AND s.vencidos > 0 THEN 'Vencida'
            ELSE 'Em uso' END AS situacao,
       COALESCE(s.vencidos, 0) AS itens_vencidos,
       u.ultima_amostra,
       COALESCE(an.inicio_manual, u.inicio_auto) AS inicio_em,
       an.inicio_manual IS NOT NULL AS inicio_fixado
FROM arquivo_caixas k
LEFT JOIN arquivo_navios an ON k.tipo = 'navio' AND an.caixa = k.numero AND an.descartado_em IS NULL
LEFT JOIN vw_arquivo_inicio_navio u ON u.navio_id = an.navio_id
LEFT JOIN LATERAL (
    SELECT count(*)::int AS itens, sum(i.quantidade)::int AS amostras, max(i.data_descarte) AS maior,
           min(i.data_descarte) AS menor, count(*) FILTER (WHERE i.situacao = 'Vencido')::int AS vencidos
    FROM vw_arquivo_itens i
    WHERE i.caixa_tipo = k.tipo AND i.caixa = k.numero AND i.situacao <> 'Descartado'
      AND (k.tipo <> 'navio' OR (i.navio IS NOT DISTINCT FROM an.navio OR arquivo_nome_navio(i.navio) = an.navio)
                                AND arquivo_viagem(i.viagem) = an.viagem)
) s ON true;

-- fixar ou apagar a data inicial da caixa de navio (sem data: volta à automática) ---------------------------------------------
CREATE OR REPLACE FUNCTION arquivo_data_inicial_navio(p_quem bigint, p_caixa int, p_data date, p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_an     arquivo_navios%ROWTYPE;
    v_auto   date;
    v_ini    date;
    v_pote   date;
    v_fcoj   date;
    v_carga  date;
    v_libera date;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF NOT EXISTS (SELECT 1 FROM arquivo_caixas WHERE tipo = 'navio' AND numero = p_caixa) THEN
        RAISE EXCEPTION 'A caixa % não é de navio: a data inicial só existe na caixa de navio.', p_caixa;
    END IF;
    SELECT * INTO v_an FROM arquivo_navios WHERE caixa = p_caixa AND descartado_em IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'A caixa % está vazia.', p_caixa;
    END IF;
    IF p_data IS NULL AND v_an.inicio_manual IS NULL THEN
        RAISE EXCEPTION 'A caixa % já está na data automática.', p_caixa;
    END IF;
    IF p_data = v_an.inicio_manual THEN
        RAISE EXCEPTION 'A caixa % já está com a data inicial %.', p_caixa, to_char(p_data, 'DD/MM/YYYY');
    END IF;
    SELECT inicio_auto INTO v_auto FROM vw_arquivo_inicio_navio WHERE navio_id = v_an.navio_id;
    v_ini := COALESCE(p_data, v_auto);
    SELECT CASE WHEN bool_or(i.item = 'pote') THEN (v_ini + interval '1 year')::date END,
           CASE WHEN bool_or(i.item = 'fcoj') THEN (v_ini + interval '2 years')::date END,
           max(i.data_descarte) FILTER (WHERE i.item = 'carga')
    INTO v_pote, v_fcoj, v_carga FROM vw_arquivo_itens i
    WHERE i.caixa_tipo = 'navio' AND i.caixa = p_caixa AND i.situacao <> 'Descartado'
      AND arquivo_nome_navio(i.navio) = v_an.navio AND arquivo_viagem(i.viagem) = v_an.viagem;
    v_libera := GREATEST(v_pote, v_fcoj, v_carga);
    IF NOT p_previa THEN
        UPDATE arquivo_navios SET inicio_manual = p_data, inicio_manual_por = p_quem, inicio_manual_em = now() WHERE id = v_an.id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'caixa', p_caixa, 'data_inicial', v_ini, 'descarte_em', v_libera,
        'texto', 'Caixa ' || p_caixa || ' (' || v_an.navio || ' ' || v_an.viagem || '): data inicial '
                 || COALESCE(to_char(v_ini, 'DD/MM/YYYY'), 'automática')
                 || CASE WHEN p_data IS NOT NULL THEN ' (escolhida à mão)'
                         WHEN v_ini IS NOT NULL THEN ' (última amostra + 5 dias)' ELSE '' END || '.'
                 || COALESCE(' NFC até ' || to_char(v_pote, 'DD/MM/YYYY') || '.', '')
                 || COALESCE(' FCOJ até ' || to_char(v_fcoj, 'DD/MM/YYYY') || '.', '')
                 || COALESCE(' A data da planilha (' || to_char(v_carga, 'DD/MM/YYYY') || ') não muda.', '')
                 || COALESCE(' A caixa libera em ' || to_char(v_libera, 'DD/MM/YYYY') || '.',
                             ' Sem amostra registrada: o descarte aparece quando a primeira entrar.'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- consultas do bot (texto pronto) -----------------------------------------------------------------------------------------
--   descartar: o que já venceu nos três arquivos · caixa: o que tem numa caixa · navio: a caixa do navio e viagem
--   disponiveis: as caixas livres (de uma família, do recebimento ou dos tanques)
CREATE OR REPLACE FUNCTION arquivo_consulta(p_dados jsonb) RETURNS text AS $$
DECLARE
    v_acao  text := p_dados ->> 'consulta';
    v_tipo  text := p_dados ->> 'tipo';
    v_num   int := NULLIF(p_dados ->> 'numero', '')::int;
    v_nome  text := arquivo_nome_navio(p_dados ->> 'navio');
    v_via   text := arquivo_viagem(p_dados ->> 'viagem');
    v_fam   text;
    v_txt   text;
    v_cx    record;
BEGIN
    IF v_acao = 'descartar' THEN
        SELECT string_agg(linha, E'\n' ORDER BY ordem, numero) INTO v_txt FROM (
            SELECT CASE k.tipo WHEN 'tanque' THEN 1 WHEN 'navio' THEN 2 ELSE 3 END AS ordem, k.numero,
                   '🔴 ' || CASE k.tipo WHEN 'tanque' THEN 'Tanque ' || k.numero || ': ' || k.itens_vencidos || ' bag'
                                 || CASE WHEN k.itens_vencidos > 1 THEN 's' ELSE '' END
                                 WHEN 'navio' THEN 'Caixa ' || k.numero || ' (' || k.navio || ' ' || k.viagem || '), venceu em '
                                 || to_char(k.descarte_em, 'DD/MM/YYYY')
                                 ELSE 'Caixa ' || k.numero || ' (recebimento): ' || k.itens_vencidos || ' load'
                                 || CASE WHEN k.itens_vencidos > 1 THEN 's' ELSE '' END END AS linha
            FROM vw_arquivo_caixas k WHERE k.situacao = 'Vencida') x;
        RETURN COALESCE('🗑️ Para descartar (vencido):' || E'\n' || v_txt
                        || E'\n\nDepois de descartar, registre: descartei caixa N (navio ou recebimento) · descartei bags do tanque N',
                        '✅ Nada vencido no arquivo de contra-amostras.');

    ELSIF v_acao = 'caixa' THEN
        IF v_tipo IS NULL THEN
            v_tipo := CASE WHEN v_num BETWEEN 121 AND 153 THEN 'recebimento' ELSE 'navio' END;
        END IF;
        SELECT * INTO v_cx FROM vw_arquivo_caixas WHERE tipo = v_tipo AND numero = v_num;
        IF NOT FOUND THEN
            RETURN '❌ Caixa ' || v_num || ' não existe no arquivo ' || CASE v_tipo WHEN 'tanque' THEN 'dos tanques'
                   WHEN 'recebimento' THEN 'do recebimento' ELSE 'de navios' END || '.';
        END IF;
        IF v_cx.situacao = 'Disponível' THEN
            RETURN '📦 Caixa ' || v_num || ' (' || CASE v_tipo WHEN 'navio' THEN v_cx.familia ELSE v_tipo END || '): disponível (vazia).';
        END IF;
        SELECT string_agg('• ' || i.descricao || COALESCE(' load ' || i.load, '') || COALESCE(' lotes ' || i.lotes, '')
                          || COALESCE(' · ' || i.quantidade || ' amostra' || CASE WHEN i.quantidade > 1 THEN 's' ELSE '' END, '')
                          || COALESCE(' · descarte ' || to_char(i.data_descarte, 'DD/MM/YYYY'), '')
                          || CASE WHEN i.situacao = 'Vencido' THEN ' 🔴' ELSE '' END, E'\n' ORDER BY i.data_ref, i.descricao)
        INTO v_txt FROM vw_arquivo_itens i
        WHERE i.caixa_tipo = v_tipo AND i.caixa = v_num AND i.situacao <> 'Descartado'
          AND (v_tipo <> 'navio' OR (arquivo_nome_navio(i.navio) = v_cx.navio AND arquivo_viagem(i.viagem) = v_cx.viagem));
        RETURN '📦 Caixa ' || v_num || CASE v_tipo WHEN 'navio' THEN ' · ' || v_cx.navio || ' ' || v_cx.viagem
                                        WHEN 'tanque' THEN ' · bags do tanque ' || v_num ELSE ' · recebimento' END
               || ' · ' || lower(v_cx.situacao)
               || COALESCE(' · data inicial ' || to_char(v_cx.inicio_em, 'DD/MM/YYYY')
                           || CASE WHEN v_cx.inicio_fixado THEN ' (escolhida à mão)' ELSE ' (última amostra + 5 dias)' END, '')
               || COALESCE(' · ' || CASE WHEN v_tipo = 'navio' THEN 'libera em ' ELSE 'próximo descarte ' END
                           || to_char(v_cx.descarte_em, 'DD/MM/YYYY'), '')
               || E'\n' || COALESCE(v_txt, 'sem amostras registradas');

    ELSIF v_acao = 'navio' THEN
        IF v_nome IS NULL THEN
            RETURN '❌ Diga o navio e a viagem, ex.: qual caixa do navio O.SKY 189?';
        END IF;
        SELECT string_agg('📦 Caixa ' || an.caixa || ': ' || an.navio || ' ' || an.viagem
                          || CASE WHEN an.descartado_em IS NOT NULL THEN ' (descartada em '
                                  || to_char(an.descartado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') || ')' ELSE '' END,
                          E'\n' ORDER BY an.viagem::text)
        INTO v_txt FROM arquivo_navios an WHERE an.navio = v_nome AND (v_via IS NULL OR an.viagem = v_via);
        IF v_txt IS NULL THEN
            v_fam := arquivo_familia(v_nome);
            RETURN '❌ ' || v_nome || COALESCE(' ' || v_via, '') || ' ainda não tem caixa.'
                   || CASE WHEN v_fam IS NULL THEN ' O navio não está numa família do arquivo: peça ao Admin para cadastrar.'
                           ELSE ' A caixa é reservada quando a primeira coleta ou embarque da viagem for registrado.' END;
        END IF;
        RETURN v_txt;

    ELSIF v_acao = 'disponiveis' THEN
        IF v_tipo = 'navio' THEN
            v_fam := arquivo_familia(v_nome);
            IF v_fam IS NULL THEN
                RETURN '❌ Não conheço a família ' || COALESCE(v_nome, '') || ' no arquivo.';
            END IF;
        END IF;
        SELECT count(*), lista_compacta(array_agg(numero ORDER BY numero)) INTO v_cx FROM vw_arquivo_caixas
        WHERE tipo = COALESCE(v_tipo, 'recebimento') AND situacao = 'Disponível' AND (v_fam IS NULL OR familia = v_fam);
        RETURN '📦 Caixas disponíveis ' || CASE COALESCE(v_tipo, 'recebimento') WHEN 'navio' THEN 'da ' || v_fam
                                             WHEN 'tanque' THEN 'dos tanques' ELSE 'do recebimento' END
               || ': ' || COALESCE(v_cx.lista_compacta, 'nenhuma')
               || CASE WHEN COALESCE(v_tipo, 'recebimento') = 'recebimento'
                       THEN E'\nSugerida para o próximo arquivamento: ' || COALESCE(arquivo_caixa_recebimento_sugerida()::text, '—')
                       ELSE '' END;
    END IF;
    RAISE EXCEPTION 'Consulta do arquivo desconhecida.';
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public, pg_temp;

-- porta do bot: consulta (texto), prévia (guarda o "sim") e gravar ----------------------------------------------------------
--   dados.acao: arquivo_consulta {consulta, ...} | arquivo_recebimento {load, item, lotes, caixa, data} | arquivo_descartar {tipo, numero}
--               | arquivo_data_inicial {numero, data} (sem data: volta à automática)
CREATE OR REPLACE FUNCTION arquivo_pelo_bot(p_fase text, p_dados jsonb, p_telefone text) RETURNS jsonb AS $$
DECLARE
    v_quem bigint;
    v_acao text := p_dados ->> 'acao';
    v_r    jsonb;
BEGIN
    v_quem := bot_quem(p_telefone);
    IF v_acao = 'arquivo_consulta' THEN
        RETURN jsonb_build_object('ok', true, 'fase', 'consulta', 'resumo', arquivo_consulta(p_dados));
    END IF;
    IF p_fase NOT IN ('previa', 'gravar') THEN
        RAISE EXCEPTION 'Fase desconhecida: %.', p_fase;
    END IF;
    IF v_acao = 'arquivo_recebimento' THEN
        v_r := arquivo_arquivar_recebimento(v_quem, p_dados ->> 'load', p_dados ->> 'item',
                   ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_dados -> 'lotes', '[]'::jsonb))::int),
                   NULLIF(p_dados ->> 'caixa', '')::int, to_date(NULLIF(p_dados ->> 'data', ''), 'DD/MM/YYYY'), p_fase = 'previa');
    ELSIF v_acao = 'arquivo_descartar' THEN
        v_r := arquivo_descartar(v_quem, p_dados ->> 'tipo', NULLIF(p_dados ->> 'numero', '')::int, p_fase = 'previa');
    ELSIF v_acao = 'arquivo_data_inicial' THEN
        v_r := arquivo_data_inicial_navio(v_quem, NULLIF(p_dados ->> 'numero', '')::int,
                   to_date(NULLIF(p_dados ->> 'data', ''), 'DD/MM/YYYY'), p_fase = 'previa');
    ELSE
        RAISE EXCEPTION 'Não entendi o pedido do arquivo.';
    END IF;
    IF p_fase = 'previa' THEN
        INSERT INTO confirmacoes (usuario_id, tipo, payload, resumo, criado_em)
        VALUES (v_quem, 'IA', jsonb_build_object('comando', 'laudo registrado: ' || p_dados::text), v_r ->> 'texto', now())
        ON CONFLICT (usuario_id) DO UPDATE
          SET tipo = EXCLUDED.tipo, payload = EXCLUDED.payload, resumo = EXCLUDED.resumo, criado_em = now();
    END IF;
    RETURN jsonb_build_object('ok', true, 'fase', p_fase, 'resumo', v_r ->> 'texto',
                              'titulo', CASE v_acao WHEN 'arquivo_descartar' THEN 'Descartar' WHEN 'arquivo_data_inicial' THEN 'Data inicial'
                                              ELSE 'Arquivar' END);
EXCEPTION
    WHEN raise_exception THEN
        RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Número ou data inválida.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- objetos novos com o mesmo dono dos outros do arquivo (a função é SECURITY DEFINER: não pode rodar como administrador)
ALTER VIEW vw_arquivo_inicio_navio OWNER TO labflow_app;
ALTER FUNCTION arquivo_data_inicial_navio(bigint, int, date, boolean) OWNER TO labflow_app;

REVOKE ALL ON FUNCTION arquivo_data_inicial_navio(bigint, int, date, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION arquivo_data_inicial_navio(bigint, int, date, boolean) TO labflow_app, labflow_app_web;
GRANT SELECT ON vw_arquivo_inicio_navio TO labflow_app, labflow_app_web, labflow_leitura;

COMMIT;
