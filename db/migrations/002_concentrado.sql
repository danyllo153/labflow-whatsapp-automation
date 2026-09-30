-- 002 — módulo de suco concentrado: recebimento, embarque, compostas e testes
--
-- Depende da 001 (usuarios, navios). Aplicar com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 002_concentrado.sql
--
-- STATUS: rascunho. Decidido: unidades (Load/lote, Navio+Linha+Fase/amostra),
-- CT e BL por lote/amostra, compostas com TAB/Coliformes/Howard.
-- A definir: comandos exatos, quem registra resultado e os prazos finais de
-- TAB e Coliformes ("vamos por passos"); as colunas de prazo abaixo guardam o
-- que foi dito até agora e podem mudar.
--
-- Resultados numéricos ficam em TEXT para manter a notação do laudo ('<1,0').

BEGIN;

-- Cadastros ---------------------------------------------------------------
CREATE TABLE fabricas (
    id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome  text NOT NULL UNIQUE
);

-- Item só importa para concentrado. Concentrado costuma ter 4 dígitos (às
-- vezes 3, ex: 319); NFC tem 3 (quase sempre 129). Não é regra rígida, por
-- isso o cadastro é livre.
CREATE TABLE itens (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo        text NOT NULL UNIQUE,
    descricao     text,
    tipo_produto  text
);

-- Recebimento -------------------------------------------------------------
-- A unidade é o Load, com Item e Fábrica fixos. Recebe lotes aos poucos
-- (cada lote = 1 amostra de carreta), de 0 a ~43, às vezes em dias diferentes.
CREATE TABLE loads (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero      text NOT NULL,
    item_id     bigint NOT NULL REFERENCES itens (id),
    fabrica_id  bigint REFERENCES fabricas (id),
    UNIQUE (numero, item_id)
);

-- CT (48h) e BL (72h e 120h) por lote, com resultado numérico por lote
CREATE TABLE recebimento_lotes (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    load_id           bigint NOT NULL REFERENCES loads (id) ON DELETE CASCADE,
    lote              integer NOT NULL CHECK (lote > 0),
    data_recebimento  date NOT NULL,
    registrado_por    bigint REFERENCES usuarios (id),
    ct_prevista       date NOT NULL,
    bl72_prevista     date NOT NULL,
    bl120_prevista    date NOT NULL,
    ct_resultado      text,
    bl72_resultado    text,
    bl120_resultado   text,
    status            text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Concluído')),
    UNIQUE (load_id, lote)
);

-- Embarque ----------------------------------------------------------------
-- Navio + viagem (a viagem já está em navios), Linha (bombeamento) e Fase.
-- Uma linha pode ter 2, 3 ou 4 fases.
CREATE TABLE embarques (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    navio_id  bigint NOT NULL REFERENCES navios (id),
    linha     integer NOT NULL CHECK (linha > 0),
    fase      integer NOT NULL CHECK (fase > 0),
    data      date NOT NULL,
    UNIQUE (navio_id, linha, fase)
);

-- Uma mesma Linha+Fase pode ter mais de um Load
CREATE TABLE embarque_loads (
    embarque_id  bigint NOT NULL REFERENCES embarques (id) ON DELETE CASCADE,
    load_id      bigint NOT NULL REFERENCES loads (id),
    PRIMARY KEY (embarque_id, load_id)
);

-- Amostras A1, A2, A3... (a quantidade varia com a tonelada embarcada)
CREATE TABLE embarque_amostras (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    embarque_id      bigint NOT NULL REFERENCES embarques (id) ON DELETE CASCADE,
    codigo           text NOT NULL CHECK (codigo ~ '^A[0-9]+$'),
    registrado_por   bigint REFERENCES usuarios (id),
    ct_prevista      date NOT NULL,
    bl72_prevista    date NOT NULL,
    bl120_prevista   date NOT NULL,
    ct_resultado     text,
    bl72_resultado   text,
    bl120_resultado  text,
    status           text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Concluído')),
    UNIQUE (embarque_id, codigo)
);

-- Compostas ---------------------------------------------------------------
-- Grupo de lotes (recebimento) ou amostras (embarque) analisados juntos.
-- Normalmente ~5, mas não sempre 5 nem em sequência ('1-3,5,6').
CREATE TABLE compostas (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    origem          text NOT NULL CHECK (origem IN ('recebimento', 'embarque')),
    load_id         bigint REFERENCES loads (id),
    embarque_id     bigint REFERENCES embarques (id),
    descricao_lotes text NOT NULL,           -- como o analista escreveu: '1-3,5,6'
    data            date NOT NULL,
    registrado_por  bigint REFERENCES usuarios (id),
    CHECK ((origem = 'recebimento') = (load_id IS NOT NULL)),
    CHECK ((origem = 'embarque') = (embarque_id IS NOT NULL))
);

-- Quais lotes/amostras entram em cada composta. Um lote pode estar em mais de
-- uma composta (por exemplo uma de TAB e outra de Coliformes).
CREATE TABLE composta_itens (
    composta_id         bigint NOT NULL REFERENCES compostas (id) ON DELETE CASCADE,
    recebimento_lote_id bigint REFERENCES recebimento_lotes (id) ON DELETE CASCADE,
    embarque_amostra_id bigint REFERENCES embarque_amostras (id) ON DELETE CASCADE,
    CHECK (num_nonnulls(recebimento_lote_id, embarque_amostra_id) = 1)
);

CREATE UNIQUE INDEX composta_itens_lote    ON composta_itens (composta_id, recebimento_lote_id) WHERE recebimento_lote_id IS NOT NULL;
CREATE UNIQUE INDEX composta_itens_amostra ON composta_itens (composta_id, embarque_amostra_id) WHERE embarque_amostra_id IS NOT NULL;

-- Testes da composta: TAB, Coliformes e Howard ----------------------------
-- TAB (total 10 dias): 5 dias no caldo BAT, estria em placa (superfície),
--   mais 5 dias em estufa, leitura no 10º dia.
--   Consultas planejadas: "quais TABs tenho para espalhar hoje?" (estria_prevista)
--   e "quais TABs tenho para ler hoje?" (leitura_prevista).
-- Coliformes: pesa no caldo, 2 dias depois estria na placa, leitura no 3º dia.
--   (prazos a ajustar na implementação)
-- Howard: não é positivo/negativo, é a porcentagem de campos positivos sobre
--   os campos lidos (método padrão: 25 campos por lâmina, 2 lâminas = 50 campos,
--   cada campo positivo vale 2%). Guarda-se campos lidos e positivos; o banco
--   calcula a porcentagem. Sem estria: só leitura.
CREATE TABLE testes_composta (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    composta_id        bigint NOT NULL REFERENCES compostas (id) ON DELETE CASCADE,
    teste              text NOT NULL CHECK (teste IN ('TAB', 'Coliformes', 'Howard')),
    data_analise       date NOT NULL,
    estria_prevista    date,                      -- nulo no Howard
    leitura_prevista   date NOT NULL,
    status             text NOT NULL DEFAULT 'Aguardando Estria'
                       CHECK (status IN ('Aguardando Estria', 'Aguardando Leitura', 'Concluído')),
    resultado          text CHECK (resultado IN ('Positivo', 'Negativo')),  -- TAB e Coliformes
    campos_lidos       integer CHECK (campos_lidos > 0),                   -- só Howard
    campos_positivos   integer CHECK (campos_positivos >= 0),              -- só Howard
    howard_percentual  numeric(5,2) GENERATED ALWAYS AS (
                           CASE WHEN campos_lidos > 0
                                THEN campos_positivos * 100.0 / campos_lidos END
                       ) STORED,
    data_leitura       date,
    analista           bigint REFERENCES usuarios (id),
    UNIQUE (composta_id, teste),
    CHECK (campos_positivos IS NULL OR campos_positivos <= campos_lidos),
    CHECK (teste = 'Howard' OR (campos_lidos IS NULL AND campos_positivos IS NULL)),
    CHECK (teste <> 'Howard' OR resultado IS NULL),
    CHECK ((teste = 'Howard') = (estria_prevista IS NULL))
);

CREATE INDEX testes_para_estriar ON testes_composta (estria_prevista)  WHERE status = 'Aguardando Estria';
CREATE INDEX testes_para_ler     ON testes_composta (leitura_prevista) WHERE status <> 'Concluído';

COMMIT;
