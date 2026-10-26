-- 105 — arquivo de contra-amostras: caixas, arquivamento e descarte (pedido PB21 da sessão do app, spec 11)
--
-- Regras do Danyllo (25/10/2026, docs/specs/lims/11-arquivo-contra-amostras.md):
--   * tanque terra: a caixa é o número do tanque (34 a 49); o bag de cada coleta já é arquivado pelo bot (arquivo_amostras,
--     1 ano depois da coleta) e entra na caixa do tanque sem nada novo para digitar;
--   * navio: uma caixa por navio e viagem, na faixa da família do navio; a viagem cabe sempre numa caixa só; o pote de cada
--     tanque de NFC do navio (1 ano) e as amostras de FCOJ do embarque (2 anos) entram nela; a caixa só libera na maior data;
--   * recebimento de FCOJ: caixas 121 a 145, informadas pelo analista; descarte 7 dias depois de arquivado; a sugestão começa
--     pela 121 (o que havia na planilha é tratado como já descartado);
--   * descarte por Admin e Analista, com um sim; nada é apagado (fica como descartado, com quem e quando).
-- As famílias de navio e as faixas reais NÃO estão aqui: entram por um arquivo fora do Git (como os limites); o exemplo
-- fictício fica em db/seeds/arquivo_exemplo.sql. Aqui só as caixas do recebimento (121-145) e dos tanques (34-49).
-- Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 105_arquivo_contra_amostras.sql
-- Desfazer: 105_arquivo_contra_amostras_desfazer.sql (publique antes o workflow anterior).
--
--   arquivo_familias (nome, caixa_de, caixa_ate) · arquivo_caixas (tipo, numero, familia)
--   arquivo_navios: a caixa de cada navio e viagem (reservada sozinha quando o navio é cadastrado; ou a carga inicial)
--   arquivo_recebimento: load e lotes arquivados numa caixa do recebimento
--   vw_arquivo_itens (uma linha por item, com a situação Arquivado / Vencido / Descartado) e vw_arquivo_caixas (uma por caixa)
--   arquivo_arquivar_recebimento, arquivo_descartar (app e bot), arquivo_consulta (texto do bot), arquivo_pelo_bot (bot)

BEGIN;

CREATE TABLE arquivo_familias (
    nome      text PRIMARY KEY,                      -- como o bot escreve o navio, sem a viagem (ex.: O.SKY)
    caixa_de  int NOT NULL CHECK (caixa_de > 0),
    caixa_ate int NOT NULL,
    CHECK (caixa_ate >= caixa_de)
);

CREATE TABLE arquivo_caixas (
    tipo    text NOT NULL CHECK (tipo IN ('navio', 'recebimento', 'tanque')),
    numero  int NOT NULL CHECK (numero > 0),
    familia text REFERENCES arquivo_familias (nome) ON UPDATE CASCADE,
    PRIMARY KEY (tipo, numero),
    CHECK ((tipo = 'navio') = (familia IS NOT NULL))
);

INSERT INTO arquivo_caixas (tipo, numero) SELECT 'recebimento', g FROM generate_series(121, 145) g;
INSERT INTO arquivo_caixas (tipo, numero) SELECT 'tanque', g FROM generate_series(34, 49) g;

CREATE TABLE arquivo_navios (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    caixa_tipo      text NOT NULL DEFAULT 'navio' CHECK (caixa_tipo = 'navio'),
    caixa           int NOT NULL,
    navio           text NOT NULL,                    -- nome padrão (O.SKY)
    viagem          text NOT NULL,                    -- sem zero à esquerda (01 vira 1)
    navio_id        bigint REFERENCES navios (id) ON DELETE SET NULL,
    origem          text NOT NULL DEFAULT 'automatico' CHECK (origem IN ('automatico', 'carga')),
    descarte_carga  date,                             -- a data da planilha, só na carga inicial
    reservada_em    timestamptz NOT NULL DEFAULT now(),
    descartado_em   timestamptz,
    descartado_por  bigint REFERENCES usuarios (id),
    FOREIGN KEY (caixa_tipo, caixa) REFERENCES arquivo_caixas (tipo, numero),
    UNIQUE (navio, viagem)
);
CREATE UNIQUE INDEX arquivo_navios_caixa_em_uso ON arquivo_navios (caixa) WHERE descartado_em IS NULL;
CREATE UNIQUE INDEX arquivo_navios_por_navio ON arquivo_navios (navio_id) WHERE navio_id IS NOT NULL;

CREATE TABLE arquivo_recebimento (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    caixa_tipo      text NOT NULL DEFAULT 'recebimento' CHECK (caixa_tipo = 'recebimento'),
    caixa           int NOT NULL,
    load_id         bigint NOT NULL REFERENCES loads (id) ON DELETE CASCADE,
    lotes           int[] NOT NULL CHECK (cardinality(lotes) > 0),
    data_arquivada  date NOT NULL,
    data_descarte   date NOT NULL,
    registrado_por  bigint REFERENCES usuarios (id),
    registrado_em   timestamptz NOT NULL DEFAULT now(),
    descartado_em   timestamptz,
    descartado_por  bigint REFERENCES usuarios (id),
    FOREIGN KEY (caixa_tipo, caixa) REFERENCES arquivo_caixas (tipo, numero)
);
CREATE INDEX arquivo_recebimento_em_uso ON arquivo_recebimento (caixa) WHERE descartado_em IS NULL;

-- nome do navio no padrão do bot: "Orange Sky", "O. Sky", "o sky" -> O.SKY; viagem sem zero à esquerda
CREATE OR REPLACE FUNCTION arquivo_nome_navio(p text) RETURNS text AS $$
    SELECT NULLIF(regexp_replace(regexp_replace(regexp_replace(upper(trim(COALESCE(p, ''))), '^ORANGE\s+', 'O.'),
                                                '^O\s*\.?\s*', 'O.'), '\s+', ' ', 'g'), 'O.');
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION arquivo_viagem(p text) RETURNS text AS $$
    SELECT CASE WHEN trim(COALESCE(p, '')) ~ '^0+$' THEN '0' ELSE NULLIF(ltrim(trim(COALESCE(p, '')), '0'), '') END;
$$ LANGUAGE sql IMMUTABLE;

-- a família do navio: o nome igual ou começando pela família (O.ALFA II é da O.ALFA)
CREATE OR REPLACE FUNCTION arquivo_familia(p_navio text) RETURNS text AS $$
    SELECT f.nome FROM arquivo_familias f
    WHERE arquivo_nome_navio(p_navio) = f.nome OR arquivo_nome_navio(p_navio) LIKE f.nome || ' %'
    ORDER BY length(f.nome) DESC LIMIT 1;
$$ LANGUAGE sql STABLE SET search_path = public, pg_temp;

-- a caixa do navio e viagem: a que já tem (pelo navio ou pela carga) ou a próxima livre da família; sem família ou sem
-- caixa livre, devolve NULL (nunca impede a coleta nem o embarque)
CREATE OR REPLACE FUNCTION arquivo_reservar_navio(p_navio_id bigint) RETURNS int AS $$
DECLARE
    v_nome   text;
    v_viagem text;
    v_fam    text;
    v_caixa  int;
BEGIN
    SELECT caixa INTO v_caixa FROM arquivo_navios WHERE navio_id = p_navio_id;
    IF FOUND THEN
        RETURN v_caixa;
    END IF;
    SELECT arquivo_nome_navio(nome), arquivo_viagem(viagem) INTO v_nome, v_viagem FROM navios WHERE id = p_navio_id;
    IF v_nome IS NULL OR v_viagem IS NULL THEN
        RETURN NULL;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('arquivo_navios'));
    UPDATE arquivo_navios SET navio_id = p_navio_id WHERE navio = v_nome AND viagem = v_viagem AND navio_id IS NULL
    RETURNING caixa INTO v_caixa;
    IF FOUND THEN
        RETURN v_caixa;
    END IF;
    v_fam := arquivo_familia(v_nome);
    IF v_fam IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT k.numero INTO v_caixa FROM arquivo_caixas k
    WHERE k.tipo = 'navio' AND k.familia = v_fam
      AND NOT EXISTS (SELECT 1 FROM arquivo_navios a WHERE a.caixa = k.numero AND a.descartado_em IS NULL)
    ORDER BY k.numero LIMIT 1;
    IF v_caixa IS NULL THEN
        RETURN NULL;
    END IF;
    INSERT INTO arquivo_navios (caixa, navio, viagem, navio_id) VALUES (v_caixa, v_nome, v_viagem, p_navio_id);
    RETURN v_caixa;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION arquivo_navio_novo() RETURNS trigger AS $$
BEGIN
    PERFORM arquivo_reservar_navio(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER arquivo_reservar_caixa AFTER INSERT ON navios FOR EACH ROW EXECUTE FUNCTION arquivo_navio_novo();

-- depois da carga das famílias: reserva a caixa dos navios que já existiam
CREATE OR REPLACE FUNCTION arquivo_completar_caixas() RETURNS int AS $$
DECLARE
    v_n int := 0;
    r   record;
BEGIN
    FOR r IN SELECT id FROM navios n WHERE NOT EXISTS (SELECT 1 FROM arquivo_navios a WHERE a.navio_id = n.id) ORDER BY id LOOP
        IF arquivo_reservar_navio(r.id) IS NOT NULL THEN
            v_n := v_n + 1;
        END IF;
    END LOOP;
    RETURN v_n;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- uma linha por item do arquivo -------------------------------------------------------------------------------------------
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
           c.data_coleta, a.data_descarte, a.status = 'Descartado' OR an.descartado_em IS NOT NULL,
           COALESCE(a.descartado_em, an.descartado_em)
    FROM arquivo_amostras a
    JOIN coletas c ON c.id = a.coleta_id
    JOIN navios n ON n.id = c.navio_id
    LEFT JOIN arquivo_navios an ON an.navio_id = n.id
    WHERE a.tipo = 'pote'
    UNION ALL
    -- FCOJ do embarque: uma linha por linha e fase (os loads juntos, a quantidade de amostras), 2 anos
    SELECT 'navio', an.caixa, 'fcoj', e.id, 'FCOJ linha ' || e.linha || ' fase ' || e.fase, n.nome, n.viagem, NULL,
           COALESCE((SELECT string_agg(l.numero, '/' ORDER BY el.principal DESC, l.numero) FROM embarque_loads el
                     JOIN loads l ON l.id = el.load_id WHERE el.embarque_id = e.id),
                    (SELECT string_agg(DISTINCT l.numero, '/') FROM embarque_amostras ea JOIN loads l ON l.id = ea.load_id
                     WHERE ea.embarque_id = e.id)),
           NULL, s.qtd, s.dia, (s.dia + interval '2 years')::date, an.descartado_em IS NOT NULL, an.descartado_em
    FROM embarques e
    JOIN navios n ON n.id = e.navio_id
    JOIN LATERAL (SELECT count(*)::int AS qtd, min(ea.data_embarque) AS dia FROM embarque_amostras ea
                  WHERE ea.embarque_id = e.id) s ON s.qtd > 0
    LEFT JOIN arquivo_navios an ON an.navio_id = n.id
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
       COALESCE(s.vencidos, 0) AS itens_vencidos
FROM arquivo_caixas k
LEFT JOIN arquivo_navios an ON k.tipo = 'navio' AND an.caixa = k.numero AND an.descartado_em IS NULL
LEFT JOIN LATERAL (
    SELECT count(*)::int AS itens, sum(i.quantidade)::int AS amostras, max(i.data_descarte) AS maior,
           min(i.data_descarte) AS menor, count(*) FILTER (WHERE i.situacao = 'Vencido')::int AS vencidos
    FROM vw_arquivo_itens i
    WHERE i.caixa_tipo = k.tipo AND i.caixa = k.numero AND i.situacao <> 'Descartado'
      AND (k.tipo <> 'navio' OR (i.navio IS NOT DISTINCT FROM an.navio OR arquivo_nome_navio(i.navio) = an.navio)
                                AND arquivo_viagem(i.viagem) = an.viagem)
) s ON true;

-- a próxima caixa do recebimento: a em uso mais recente, ou a primeira livre desde a 121
CREATE OR REPLACE FUNCTION arquivo_caixa_recebimento_sugerida() RETURNS int AS $$
    SELECT COALESCE(
        (SELECT r.caixa FROM arquivo_recebimento r WHERE r.descartado_em IS NULL ORDER BY r.registrado_em DESC LIMIT 1),
        (SELECT k.numero FROM arquivo_caixas k WHERE k.tipo = 'recebimento'
           AND NOT EXISTS (SELECT 1 FROM arquivo_recebimento r WHERE r.caixa = k.numero AND r.descartado_em IS NULL)
         ORDER BY k.numero LIMIT 1));
$$ LANGUAGE sql STABLE SET search_path = public, pg_temp;

-- arquivar load e lotes do recebimento numa caixa (121 a 145) -------------------------------------------------------------
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
        RAISE EXCEPTION 'As caixas do recebimento vão de 121 a 145 (a sugerida agora é a %).', arquivo_caixa_recebimento_sugerida();
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
            CASE v_tipo WHEN 'tanque' THEN 'dos tanques (34 a 49)' WHEN 'recebimento' THEN 'do recebimento (121 a 145)' ELSE 'de navios' END;
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
            v_tipo := CASE WHEN v_num BETWEEN 121 AND 145 THEN 'recebimento' ELSE 'navio' END;
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

-- porta do bot: consulta (texto), prévia (guarda o "sim") e gravar ----------------------------------------------------------
--   dados.acao: arquivo_consulta {consulta, ...} | arquivo_recebimento {load, item, lotes, caixa, data} | arquivo_descartar {tipo, numero}
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
                              'titulo', CASE WHEN v_acao = 'arquivo_descartar' THEN 'Descartar' ELSE 'Arquivar' END);
EXCEPTION
    WHEN raise_exception THEN
        RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
    WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Número ou data inválida.');
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION arquivo_arquivar_recebimento(bigint, text, text, int[], int, date, boolean),
                       arquivo_descartar(bigint, text, int, boolean), arquivo_consulta(jsonb), arquivo_pelo_bot(text, jsonb, text),
                       arquivo_reservar_navio(bigint), arquivo_completar_caixas(), arquivo_caixa_recebimento_sugerida()
                  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION arquivo_arquivar_recebimento(bigint, text, text, int[], int, date, boolean),
                          arquivo_descartar(bigint, text, int, boolean), arquivo_consulta(jsonb), arquivo_pelo_bot(text, jsonb, text),
                          arquivo_reservar_navio(bigint), arquivo_completar_caixas(), arquivo_caixa_recebimento_sugerida()
                       TO labflow_app;
-- o app: lê as views e grava pelas duas funções (a conferência do cargo é delas)
GRANT EXECUTE ON FUNCTION arquivo_arquivar_recebimento(bigint, text, text, int[], int, date, boolean),
                          arquivo_descartar(bigint, text, int, boolean), arquivo_caixa_recebimento_sugerida()
                       TO labflow_app_web;
GRANT SELECT ON arquivo_familias, arquivo_caixas, arquivo_navios, arquivo_recebimento, vw_arquivo_itens, vw_arquivo_caixas
    TO labflow_app_web, labflow_leitura;

COMMIT;
