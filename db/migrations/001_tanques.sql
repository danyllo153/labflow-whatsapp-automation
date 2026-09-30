-- 001 — módulo de tanques (substitui as abas do Google Sheets)
--
-- Banco: labflow (PostgreSQL 15). Aplicar com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 001_tanques.sql
--
-- Convenções:
--   - a coleta é o centro: drops, arquivo e análises apontam para ela (coleta_id)
--   - tanque é TEXT (terra é número, navio é código tipo '1C', '4P')
--   - textos de identificação (tanque, nome do navio) são gravados em MAIÚSCULAS,
--     e o banco recusa o resto: a normalização fica no n8n, o banco só confere
--   - datas de prazo são DATE; momentos de registro são timestamptz
--   - o fuso do banco é America/Sao_Paulo (ALTER DATABASE, ver docs), então
--     CURRENT_DATE é o "hoje" de Brasília em qualquer consulta
--   - CHECK em vez de ENUM: acrescentar um valor é um ALTER TABLE simples

BEGIN;

-- Usuários e permissões (aba USUARIOS) ---------------------------------------
CREATE TABLE usuarios (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telefone   text NOT NULL UNIQUE CHECK (telefone ~ '^[0-9]+$'),  -- só dígitos, com DDI
    nome       text,
    cargo      text NOT NULL CHECK (cargo IN ('Admin', 'Operador', 'Consultor')),
    criado_em  timestamptz NOT NULL DEFAULT now()
);

-- Navios: 'O.SKY 123' = nome 'O.SKY', viagem '123' ---------------------------
CREATE TABLE navios (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome    text NOT NULL CHECK (nome = upper(nome)),
    viagem  text NOT NULL,
    UNIQUE (nome, viagem)
);

-- Coletas (abas COLETAS_TERRA e COLETAS_NAVIO) -------------------------------
CREATE TABLE coletas (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    origem          text NOT NULL CHECK (origem IN ('terra', 'navio')),
    navio_id        bigint REFERENCES navios (id),
    tanque          text NOT NULL CHECK (tanque = upper(tanque)),
    data_coleta     date NOT NULL,
    registrado_por  bigint REFERENCES usuarios (id),
    registrado_em   timestamptz NOT NULL DEFAULT now(),
    CHECK ((origem = 'navio') = (navio_id IS NOT NULL)),
    -- Bloqueio de coleta duplicada (F3) feito pelo banco. NULLS NOT DISTINCT
    -- (PostgreSQL 15+) faz a coleta de terra, que tem navio_id nulo, também
    -- conflitar; sem isso, dois NULL seriam "diferentes" e nada seria bloqueado.
    UNIQUE NULLS NOT DISTINCT (origem, navio_id, tanque, data_coleta)
);

-- Drops D5/D10/D15 (aba DROPS) ------------------------------------------------
CREATE TABLE drops (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coleta_id      bigint NOT NULL REFERENCES coletas (id) ON DELETE CASCADE,
    dia            smallint NOT NULL CHECK (dia IN (5, 10, 15)),
    data_prevista  date NOT NULL,
    status         text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Concluído')),
    concluido_por  bigint REFERENCES usuarios (id),
    concluido_em   timestamptz,
    UNIQUE (coleta_id, dia)
);

CREATE INDEX drops_pendentes_por_data ON drops (data_prevista) WHERE status = 'Pendente';

-- Amostra de arquivo, descarte em 1 ano (abas BAGS_TERRA e POTES_NAVIO) -------
-- bag para coleta de terra, pote para coleta de navio
CREATE TABLE arquivo_amostras (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coleta_id       bigint NOT NULL UNIQUE REFERENCES coletas (id) ON DELETE CASCADE,
    tipo            text NOT NULL CHECK (tipo IN ('bag', 'pote')),
    data_descarte   date NOT NULL,
    status          text NOT NULL DEFAULT 'Arquivado' CHECK (status IN ('Arquivado', 'Descartado')),
    descartado_por  bigint REFERENCES usuarios (id),
    descartado_em   timestamptz
);

CREATE INDEX arquivo_por_descarte ON arquivo_amostras (data_descarte) WHERE status = 'Arquivado';

-- Análises de tanque: CT / BL / WORT (aba ANALISES) --------------------------
-- Cada comando gera 4 linhas por tanque: CT Prof., BL Prof., WORT Prof. e
-- WORT Superfície. Um único campo status descreve o estágio atual.
CREATE TABLE analises (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coleta_id               bigint NOT NULL REFERENCES coletas (id) ON DELETE CASCADE,
    frasco                  text NOT NULL CHECK (frasco IN ('Normal', 'Stress')),
    sub_analise             text NOT NULL CHECK (sub_analise IN ('CT', 'BL', 'WORT')),
    metodo                  text NOT NULL CHECK (metodo IN ('Profundidade', 'Superficie')),
    data_analise            date NOT NULL,
    pre_leitura_prevista    date,                     -- nulo no CT (só leitura final)
    leitura_final_prevista  date NOT NULL,
    status                  text NOT NULL
                            CHECK (status IN ('Aguardando Pré-Leitura',
                                              'Aguardando Leitura Final',
                                              'Concluído')),
    registrado_por          bigint REFERENCES usuarios (id),
    pre_leitura_por         bigint REFERENCES usuarios (id),
    leitura_final_por       bigint REFERENCES usuarios (id),
    registrado_em           timestamptz NOT NULL DEFAULT now(),
    -- regras de negócio do laudo: CT não tem pré-leitura; só o WORT tem Superfície
    CHECK ((sub_analise = 'CT') = (pre_leitura_prevista IS NULL)),
    CHECK (metodo = 'Profundidade' OR sub_analise = 'WORT')
);

CREATE INDEX analises_por_coleta        ON analises (coleta_id);
CREATE INDEX analises_por_pre_leitura   ON analises (pre_leitura_prevista)   WHERE status = 'Aguardando Pré-Leitura';
CREATE INDEX analises_por_leitura_final ON analises (leitura_final_prevista) WHERE status <> 'Concluído';

-- Confirmação em duas etapas (aba CONFIRMACOES_PENDENTES) --------------------
-- Uma pendência por usuário (a nova substitui a anterior). A expiração de
-- 10 minutos vira uma comparação com now(), sem ler data em texto (Bug da 0.7.0).
CREATE TABLE confirmacoes (
    usuario_id  bigint PRIMARY KEY REFERENCES usuarios (id) ON DELETE CASCADE,
    tipo        text NOT NULL CHECK (tipo IN ('LEITURA', 'IA')),
    payload     jsonb NOT NULL,  -- LEITURA: ids das análises e novos status; IA: comando montado
    resumo      text NOT NULL,
    criado_em   timestamptz NOT NULL DEFAULT now()
);

COMMIT;
