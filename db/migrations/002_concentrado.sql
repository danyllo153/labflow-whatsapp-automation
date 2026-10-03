-- 002 — concentrado (FCOJ): recebimento, compostas e testes de composta
--
-- Depende da 001. Aplicar com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 002_concentrado.sql
--
-- Desenho: docs/concentrado.md. Ordem fixa: recebimento -> compostas -> testes.
-- O número curto da composta ("#12") é o próprio id.
-- Embarque e C.T/B.L por lote entram em migrations seguintes (fases C e D).

BEGIN;

CREATE TABLE fabricas (
    id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome  text NOT NULL UNIQUE CHECK (nome = upper(nome))
);

-- Item só importa para concentrado; cadastro livre (4 dígitos costuma ser
-- concentrado, 3 é NFC, mas não é regra rígida)
CREATE TABLE itens (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo  text NOT NULL UNIQUE
);

-- O Load tem item e fábrica fixos e recebe lotes aos poucos
CREATE TABLE loads (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero      text NOT NULL,
    item_id     bigint NOT NULL REFERENCES itens (id),
    fabrica_id  bigint NOT NULL REFERENCES fabricas (id),
    criado_por  bigint REFERENCES usuarios (id),
    criado_em   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (numero, item_id)
);

CREATE TABLE recebimento_lotes (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    load_id           bigint NOT NULL REFERENCES loads (id) ON DELETE CASCADE,
    lote              integer NOT NULL CHECK (lote > 0),
    data_recebimento  date NOT NULL,
    registrado_por    bigint REFERENCES usuarios (id),
    registrado_em     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (load_id, lote)
);

-- Composta: criada no recebimento, de 1 a N lotes; TAB e Coliformes usam a mesma
CREATE TABLE compostas (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- o "#12"
    load_id     bigint NOT NULL REFERENCES loads (id) ON DELETE CASCADE,
    criada_por  bigint REFERENCES usuarios (id),
    criada_em   timestamptz NOT NULL DEFAULT now()
);

-- Um lote está em no máximo uma composta
CREATE TABLE composta_lotes (
    composta_id          bigint NOT NULL REFERENCES compostas (id) ON DELETE CASCADE,
    recebimento_lote_id  bigint NOT NULL UNIQUE REFERENCES recebimento_lotes (id) ON DELETE CASCADE,
    PRIMARY KEY (composta_id, recebimento_lote_id)
);

-- Testes: TAB e Coliformes de composta; TAB de NFC é por coleta de tanque.
-- Cada etapa guarda quem fez (analista) e quando.
CREATE TABLE testes (
    id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo                  text NOT NULL CHECK (tipo IN ('TAB', 'COLIFORMES', 'HOWARD')),
    composta_id           bigint REFERENCES compostas (id) ON DELETE CASCADE,
    coleta_id             bigint REFERENCES coletas (id) ON DELETE CASCADE,
    status                text NOT NULL CHECK (status IN ('No caldo', 'Estriada', 'Incubada', 'Em confirmação', 'Concluída')),
    resultado             text CHECK (resultado IN ('Positivo', 'Negativo')),
    percentual            numeric(5,2) CHECK (percentual BETWEEN 0 AND 100),   -- Howard
    data_feito            date NOT NULL,
    feito_por             bigint REFERENCES usuarios (id),
    espalhar_prevista     date,          -- TAB: espalhar; Coliformes: estriar
    espalhado_em          timestamptz,
    espalhado_por         bigint REFERENCES usuarios (id),
    leitura_prevista      date,
    confirmacao_prevista  date,
    confirmacao_em        timestamptz,
    confirmacao_por       bigint REFERENCES usuarios (id),
    resultado_em          timestamptz,
    resultado_por         bigint REFERENCES usuarios (id),
    criado_em             timestamptz NOT NULL DEFAULT now(),
    CHECK ((composta_id IS NULL) <> (coleta_id IS NULL)),
    CHECK ((status = 'Concluída') = (resultado IS NOT NULL OR percentual IS NOT NULL)),
    UNIQUE (tipo, composta_id),
    UNIQUE (tipo, coleta_id)
);

CREATE INDEX testes_espalhar ON testes (espalhar_prevista) WHERE status = 'No caldo';
CREATE INDEX testes_leitura  ON testes (leitura_prevista)  WHERE status IN ('Incubada', 'Estriada');

COMMIT;
