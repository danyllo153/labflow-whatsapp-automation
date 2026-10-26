-- 108 — bot: caixas do recebimento de 121 a 153 (PB23)
--
-- Pedido do Danyllo de 26/10 (conferido no laboratório): o recebimento de FCOJ vai da caixa 121 à 153 (eram 121 a 145). As caixas
-- 146 a 153 deixam de ser de navio: a família que começava nelas passa a começar na 154 (na planilha real os navios dela já
-- estão a partir da 154). Nada guardado se perde: se alguma caixa de navio de 146 a 153 tiver ou já tiver tido navio, a migration
-- para sem mudar nada. As funções da 105 com o texto "121 a 145" são refeitas iguais, só com o 153.
-- Faixa do bot (100–149). Desfazer: 108_caixas_recebimento_153_desfazer.sql. Aplicar com o administrador do banco, depois de
-- um backup:
--   psql -U $POSTGRES_USER -d labflow -v ON_ERROR_STOP=1 -f 108_caixas_recebimento_153.sql

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM arquivo_navios WHERE caixa BETWEEN 146 AND 153) THEN
        RAISE EXCEPTION 'Há navio guardado (ou descartado) numa caixa de 146 a 153: mude-o de caixa antes. Nada foi alterado.';
    END IF;
    IF EXISTS (SELECT 1 FROM arquivo_caixas WHERE tipo = 'recebimento' AND numero BETWEEN 146 AND 153) THEN
        RAISE EXCEPTION 'As caixas 146 a 153 já são do recebimento. Nada foi alterado.';
    END IF;
END $$;

DELETE FROM arquivo_caixas WHERE tipo = 'navio' AND numero BETWEEN 146 AND 153;
UPDATE arquivo_familias SET caixa_de = 154 WHERE caixa_de BETWEEN 146 AND 153 AND caixa_ate >= 154;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM arquivo_familias WHERE caixa_de <= 153 AND caixa_ate >= 146) THEN
        RAISE EXCEPTION 'Uma família de navios ainda usa caixas de 146 a 153: ajuste a família antes. Nada foi alterado.';
    END IF;
END $$;

INSERT INTO arquivo_caixas (tipo, numero) SELECT 'recebimento', g FROM generate_series(146, 153) g;

-- arquivar load e lotes do recebimento numa caixa (121 a 153) -------------------------------------------------------------
CREATE OR REPLACE FUNCTION arquivo_arquivar_recebimento(p_quem bigint, p_load text, p_item text, p_lotes int[], p_caixa int,
                                                        p_data date DEFAULT NULL, p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_load  text := trim(COALESCE(p_load, ''));
    v_item  text := NULLIF(trim(COALESCE(p_item, '')), '');
    v_dia   date := COALESCE(p_data, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
    v_n     int;
    v_ld    bigint;
    v_lotes int[];
    v_erro  text;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF NOT EXISTS (SELECT 1 FROM arquivo_caixas WHERE tipo = 'recebimento' AND numero = p_caixa) THEN
        RAISE EXCEPTION 'As caixas do recebimento vão de 121 a 153 (a sugerida agora é a %).', arquivo_caixa_recebimento_sugerida();
    END IF;
    SELECT array_agg(DISTINCT x ORDER BY x) INTO v_lotes FROM unnest(p_lotes) x WHERE x IS NOT NULL;
    IF v_lotes IS NULL THEN
        RAISE EXCEPTION 'Diga os lotes, ex.: arquivei load 43599 lotes 1-12 caixa 121.';
    END IF;
    IF v_dia > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
        RAISE EXCEPTION 'A data do arquivamento não pode ser no futuro.';
    END IF;
    SELECT count(*), min(l.id) INTO v_n, v_ld FROM loads l JOIN itens it ON it.id = l.item_id
    WHERE l.numero = v_load AND (v_item IS NULL OR it.codigo = v_item);
    IF v_n = 0 THEN
        RAISE EXCEPTION 'Load % não encontrado. Registre o recebimento primeiro.', v_load || COALESCE(' item ' || v_item, '');
    ELSIF v_n > 1 THEN
        RAISE EXCEPTION 'Existe mais de um load %. Informe o item: arquivei load % item 444 lotes 1-5 caixa 121.', v_load, v_load;
    END IF;
    SELECT string_agg('lote ' || x || ' não foi recebido', '; ' ORDER BY x) INTO v_erro FROM unnest(v_lotes) x
    WHERE NOT EXISTS (SELECT 1 FROM recebimento_lotes rl WHERE rl.load_id = v_ld AND rl.lote = x);
    IF v_erro IS NULL THEN
        SELECT string_agg('lote ' || x || ' já está na caixa ' || r.caixa, '; ' ORDER BY x) INTO v_erro
        FROM unnest(v_lotes) x JOIN arquivo_recebimento r ON r.load_id = v_ld AND r.descartado_em IS NULL AND x = ANY (r.lotes);
    END IF;
    IF v_erro IS NOT NULL THEN
        RAISE EXCEPTION 'Nada arquivado: %.', v_erro;
    END IF;
    IF NOT p_previa THEN
        INSERT INTO arquivo_recebimento (caixa, load_id, lotes, data_arquivada, data_descarte, registrado_por)
        VALUES (p_caixa, v_ld, v_lotes, v_dia, v_dia + 7, p_quem);
    END IF;
    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'caixa', p_caixa,
        'texto', 'Caixa ' || p_caixa || ' (recebimento): load ' || v_load || ' lotes ' || lista_compacta(v_lotes)
                 || ', arquivado em ' || to_char(v_dia, 'DD/MM/YYYY') || ', descarte em ' || to_char(v_dia + 7, 'DD/MM/YYYY') || '.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- descartar o que venceu numa caixa ---------------------------------------------------------------------------------------
-- navio: a caixa inteira, só depois da maior data; recebimento e tanque: o que já venceu (o resto fica)
CREATE OR REPLACE FUNCTION arquivo_descartar(p_quem bigint, p_tipo text, p_numero int, p_previa boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
    v_tipo  text := lower(trim(COALESCE(p_tipo, '')));
    v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_an    arquivo_navios%ROWTYPE;
    v_ate   date;
    v_n     int;
    v_resto int;
    v_lista text;
BEGIN
    PERFORM tanque_exigir_cargo(p_quem, ARRAY['Admin', 'Analista']);
    IF NOT EXISTS (SELECT 1 FROM arquivo_caixas WHERE tipo = v_tipo AND numero = p_numero) THEN
        RAISE EXCEPTION 'Caixa % não existe no arquivo %.', p_numero,
            CASE v_tipo WHEN 'tanque' THEN 'dos tanques (34 a 49)' WHEN 'recebimento' THEN 'do recebimento (121 a 153)' ELSE 'de navios' END;
    END IF;

    IF v_tipo = 'navio' THEN
        SELECT * INTO v_an FROM arquivo_navios WHERE caixa = p_numero AND descartado_em IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'A caixa % está vazia.', p_numero;
        END IF;
        SELECT descarte_em INTO v_ate FROM vw_arquivo_caixas WHERE tipo = 'navio' AND numero = p_numero;
        IF v_ate IS NOT NULL AND v_ate > v_hoje THEN
            RAISE EXCEPTION 'A caixa % (% %) ainda não venceu: libera em %.', p_numero, v_an.navio, v_an.viagem, to_char(v_ate, 'DD/MM/YYYY');
        END IF;
        SELECT count(*), string_agg(i.descricao || COALESCE(' load ' || i.load, ''), '; ' ORDER BY i.item, i.descricao)
        INTO v_n, v_lista FROM vw_arquivo_itens i
        WHERE i.caixa_tipo = 'navio' AND i.caixa = p_numero AND i.situacao <> 'Descartado'
          AND arquivo_nome_navio(i.navio) = v_an.navio AND arquivo_viagem(i.viagem) = v_an.viagem;
        IF NOT p_previa THEN
            UPDATE arquivo_navios SET descartado_em = now(), descartado_por = p_quem WHERE id = v_an.id;
            UPDATE arquivo_amostras a SET status = 'Descartado', descartado_em = now(), descartado_por = p_quem
            FROM coletas c WHERE c.id = a.coleta_id AND a.tipo = 'pote' AND a.status = 'Arquivado' AND c.navio_id = v_an.navio_id;
        END IF;
        RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'descartados', v_n,
            'texto', 'Caixa ' || p_numero || ' (navio ' || v_an.navio || ' ' || v_an.viagem || '): ' || COALESCE(v_lista, 'carga inicial')
                     || '. A caixa fica disponível.');
    END IF;

    SELECT count(*), string_agg(i.descricao || COALESCE(' lotes ' || i.lotes, '') || ' (' || to_char(i.data_ref, 'DD/MM/YYYY') || ')',
                                '; ' ORDER BY i.data_ref, i.descricao)
    INTO v_n, v_lista FROM vw_arquivo_itens i
    WHERE i.caixa_tipo = v_tipo AND i.caixa = p_numero AND i.situacao = 'Vencido';
    SELECT count(*) INTO v_resto FROM vw_arquivo_itens i
    WHERE i.caixa_tipo = v_tipo AND i.caixa = p_numero AND i.situacao = 'Arquivado';
    IF v_n = 0 THEN
        RAISE EXCEPTION 'Nada vencido na caixa %.', p_numero
            || CASE WHEN v_resto > 0 THEN ' (' || v_resto || ' ainda dentro do prazo)' ELSE ' (está vazia)' END;
    END IF;
    IF NOT p_previa THEN
        IF v_tipo = 'recebimento' THEN
            UPDATE arquivo_recebimento SET descartado_em = now(), descartado_por = p_quem
            WHERE caixa = p_numero AND descartado_em IS NULL AND data_descarte <= v_hoje;
        ELSE
            UPDATE arquivo_amostras a SET status = 'Descartado', descartado_em = now(), descartado_por = p_quem
            FROM coletas c WHERE c.id = a.coleta_id AND a.tipo = 'bag' AND a.status = 'Arquivado' AND a.data_descarte <= v_hoje
              AND c.tanque ~ '^\d{1,4}$' AND c.tanque::int = p_numero;
        END IF;
    END IF;
    RETURN jsonb_build_object('ok', true, 'previa', p_previa, 'descartados', v_n,
        'texto', 'Caixa ' || p_numero || CASE v_tipo WHEN 'tanque' THEN ' (tanque ' || p_numero || ', bags)' ELSE ' (recebimento)' END
                 || ': ' || v_lista || '.'
                 || CASE WHEN v_resto > 0 THEN ' Ficam ' || v_resto || ' dentro do prazo.' ELSE ' A caixa fica disponível.' END);
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

COMMIT;
