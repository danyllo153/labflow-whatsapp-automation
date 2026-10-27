-- 079 — app: água de consumo (Santos e TMG/Guarujá; mensal e semanal) e a água dos navios (TEC e COZ)
--
-- Faixa do app (050–099). Pedido do Danyllo de 27/10. Desfazer: 079_app_agua_consumo_desfazer.sql. Aplicar com o
-- administrador do banco, depois de um backup.
--
-- - pontos: os pontos de coleta de cada unidade, editáveis pelo Admin no app (nome, ordem, ativo). O repositório só tem
--   nomes fictícios ("Ponto 1"...); os nomes reais são cadastrados no app, no servidor. Mensal: até 30 no TMG e 8 em
--   Santos; semanal: os mesmos pontos para a físico-química e a microbiológica.
-- - coletas e resultados: uma coleta (data e hora, quem coletou) com uma linha por ponto. O nome do ponto é copiado na
--   linha (renomear o ponto depois não muda o que já foi coletado). Mensal e navio: C.T 48 h, B.L 120 h, Coliformes
--   totais e E.coli (P/A, bag de 24 h). Semanal: pH, cloro livre e observação (físico-química) e Coliformes e E.coli.
-- - navio: unidade 'Navio', com o navio e a viagem ("O.BLOSSOM II - 123") e os pontos TEC (água técnica) e COZ (cozinha).
-- - limites: C.T, B.L, pH e cloro, um valor por parâmetro, editáveis pelo Admin. Aqui só valores FICTÍCIOS; os reais
--   são gravados pelo app (ou por arquivo fora do Git), nunca no repositório.
-- - os laudos (folhas em app.paginas_laudo e lugar das linhas em app.laudo_linhas, 076): mensal de cada unidade, o dos
--   navios (o mesmo modelo do mensal), e o físico-químico e o microbiológico semanais de cada unidade.

BEGIN;

CREATE TABLE app.pontos_agua_consumo (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unidade   text NOT NULL CHECK (unidade IN ('Santos', 'TMG')),
    tipo      text NOT NULL CHECK (tipo IN ('mensal', 'semanal')),
    nome      text NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 50),
    ordem     integer NOT NULL CHECK (ordem BETWEEN 1 AND 99),
    ativo     boolean NOT NULL DEFAULT true,
    UNIQUE (unidade, tipo, nome)
);

CREATE TABLE app.coletas_agua_consumo (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unidade         text NOT NULL CHECK (unidade IN ('Santos', 'TMG', 'Navio')),
    tipo            text NOT NULL CHECK (tipo IN ('mensal', 'semanal')),
    navio           text CHECK (navio IS NULL OR length(trim(navio)) BETWEEN 1 AND 40),
    coletada_em     timestamptz NOT NULL,
    coletada_por    bigint NOT NULL REFERENCES usuarios (id),
    coletor_nome    text CHECK (coletor_nome IS NULL OR length(trim(coletor_nome)) BETWEEN 1 AND 60),  -- quando não foi quem digitou
    registrada_em   timestamptz NOT NULL DEFAULT clock_timestamp(),
    analisada_em    timestamptz,                         -- o cabeçalho do semanal: data e hora da análise
    analisada_por   bigint REFERENCES usuarios (id),
    excluida_em     timestamptz,
    excluida_por    bigint REFERENCES usuarios (id),
    motivo_exclusao text,
    CHECK ((unidade = 'Navio') = (navio IS NOT NULL)),
    CHECK (unidade <> 'Navio' OR tipo = 'mensal'),
    CHECK ((excluida_em IS NULL) = (excluida_por IS NULL)),
    CHECK (excluida_em IS NULL OR nullif(trim(motivo_exclusao), '') IS NOT NULL)
);
CREATE INDEX coletas_agua_consumo_por_data ON app.coletas_agua_consumo (unidade, tipo, coletada_em) WHERE excluida_em IS NULL;

CREATE TABLE app.resultados_agua_consumo (
    coleta_id   bigint NOT NULL REFERENCES app.coletas_agua_consumo (id),
    ordem       integer NOT NULL CHECK (ordem BETWEEN 1 AND 99),
    ponto       text NOT NULL CHECK (length(trim(ponto)) BETWEEN 1 AND 50),
    ct          text CHECK (ct IS NULL OR length(trim(ct)) BETWEEN 1 AND 10),
    bl          text CHECK (bl IS NULL OR length(trim(bl)) BETWEEN 1 AND 10),
    coliformes  text CHECK (coliformes IN ('P', 'A')),
    ecoli       text CHECK (ecoli IN ('P', 'A')),
    ph          numeric(4, 2) CHECK (ph BETWEEN 0 AND 14),
    cloro       numeric(5, 2) CHECK (cloro BETWEEN 0 AND 100),
    observacao  text CHECK (observacao IS NULL OR length(trim(observacao)) BETWEEN 1 AND 40),
    lido_por    bigint REFERENCES usuarios (id),
    lido_em     timestamptz,
    PRIMARY KEY (coleta_id, ordem)
);

CREATE TABLE app.limites_agua_consumo (
    parametro    text PRIMARY KEY CHECK (parametro IN ('ct', 'bl', 'ph_min', 'ph_max', 'cloro_min', 'cloro_max')),
    valor        numeric(8, 2) NOT NULL CHECK (valor >= 0),
    alterado_por bigint REFERENCES usuarios (id),
    alterado_em  timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- valores FICTÍCIOS (o Admin grava os reais no app)
INSERT INTO app.limites_agua_consumo (parametro, valor) VALUES
    ('ct', 500), ('bl', 50), ('ph_min', 6.0), ('ph_max', 9.5), ('cloro_min', 0.2), ('cloro_max', 5.0);

-- pontos FICTÍCIOS (o Admin renomeia e acrescenta no app): 8 no TMG e 2 em Santos, no mensal e no semanal
INSERT INTO app.pontos_agua_consumo (unidade, tipo, nome, ordem)
SELECT u, t, 'Ponto ' || n, n
FROM (VALUES ('TMG', 8), ('Santos', 2)) x(u, qtd)
CROSS JOIN (VALUES ('mensal'), ('semanal')) y(t)
CROSS JOIN LATERAL generate_series(1, x.qtd) n;

ALTER TABLE app.paginas_laudo DROP CONSTRAINT paginas_laudo_laudo_check;
ALTER TABLE app.paginas_laudo ADD CONSTRAINT paginas_laudo_laudo_check CHECK (laudo IN (
    'material-asseptico', 'meios-OSA', 'meios-PDA', 'meios-PCA', 'meios-Wort',
    'agua-processo', 'superficies-Baia', 'superficies-Linha', 'fluxo-laminar', 'incubacao', 'recebimento-fcoj',
    'recebimento-nfc', 'tab', 'coliformes', 'howard', 'nfc-tanques', 'embarque-fcoj', 'contra-embarque', 'contra-recebimento',
    'agua-consumo-mensal-Santos', 'agua-consumo-mensal-TMG', 'agua-consumo-navio',
    'agua-consumo-fq-Santos', 'agua-consumo-fq-TMG', 'agua-consumo-micro-Santos', 'agua-consumo-micro-TMG'
));

GRANT SELECT, INSERT, UPDATE ON app.pontos_agua_consumo, app.coletas_agua_consumo, app.resultados_agua_consumo,
    app.limites_agua_consumo TO labflow_app_web;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
