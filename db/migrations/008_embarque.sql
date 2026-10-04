-- 008 — embarque (navio + linha + fase), compostas de embarque e Howard
--
-- Depende da 001 (navios, usuarios) e da 002/004/007 (loads, compostas, vw_compostas).
-- Aplicar com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 008_embarque.sql
--
-- Desenho: docs/concentrado.md, seções 5 e 10.1.
--   * embarque = navio+viagem, linha e fase. As amostras (A1, A2...) pertencem a UM load;
--     uma linha+fase pode ter mais de um load (um comando por load).
--   * o load do embarque NÃO precisa existir antes: load antigo é cadastrado na hora, sem fábrica.
--   * a composta de embarque é ligada à linha+fase e junta amostras (de loads diferentes, se for o caso).
--   * TAB, Coliformes e Howard usam a MESMA composta, e os comandos com "#" continuam valendo.

BEGIN;

CREATE TABLE embarques (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    navio_id    bigint NOT NULL REFERENCES navios (id),
    linha       integer NOT NULL CHECK (linha > 0),
    fase        integer NOT NULL CHECK (fase > 0),
    criado_por  bigint REFERENCES usuarios (id),
    criado_em   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (navio_id, linha, fase)
);

-- A numeração (A1, A2...) é da linha+fase e não repete entre loads
CREATE TABLE embarque_amostras (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    embarque_id     bigint NOT NULL REFERENCES embarques (id) ON DELETE CASCADE,
    load_id         bigint NOT NULL REFERENCES loads (id),
    numero          integer NOT NULL CHECK (numero > 0),
    data_embarque   date NOT NULL,
    registrado_por  bigint REFERENCES usuarios (id),
    registrado_em   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (embarque_id, numero)
);

CREATE INDEX embarque_amostras_por_load ON embarque_amostras (load_id);

-- O embarque pode ser de um load antigo, que nunca passou pelo recebimento no sistema.
-- Nesse caso o bot cadastra o load (número + item) sem fábrica, que o comando de
-- embarque não informa. Por isso a fábrica deixa de ser obrigatória no load.
ALTER TABLE loads ALTER COLUMN fabrica_id DROP NOT NULL;

-- Composta: de load (recebimento) OU de linha+fase (embarque)
ALTER TABLE compostas ALTER COLUMN load_id DROP NOT NULL;
ALTER TABLE compostas ADD COLUMN embarque_id bigint REFERENCES embarques (id) ON DELETE CASCADE;
ALTER TABLE compostas ADD CONSTRAINT compostas_origem_check CHECK ((load_id IS NULL) <> (embarque_id IS NULL));

-- Item da composta: lote recebido OU amostra de embarque
ALTER TABLE composta_lotes DROP CONSTRAINT composta_lotes_pkey;
ALTER TABLE composta_lotes ALTER COLUMN recebimento_lote_id DROP NOT NULL;
ALTER TABLE composta_lotes ADD COLUMN embarque_amostra_id bigint UNIQUE REFERENCES embarque_amostras (id) ON DELETE CASCADE;
ALTER TABLE composta_lotes ADD CONSTRAINT composta_lotes_alvo_check CHECK (num_nonnulls(recebimento_lote_id, embarque_amostra_id) = 1);

-- View das compostas, agora com as duas origens. As cinco primeiras colunas
-- ficam iguais (id, load, item, fabrica, lotes), para os nodes atuais continuarem
-- funcionando; as novas vêm no fim.
--   rotulo  : "load 77001" ou "O.SKY 133 linha 2 fase 2"
--   prefixo : '' no recebimento, 'A' no embarque (lotes = números das amostras)
CREATE OR REPLACE VIEW vw_compostas AS
SELECT c.id,
       l.numero AS load,
       it.codigo AS item,
       fb.nome AS fabrica,
       array_agg(rl.lote ORDER BY rl.lote) AS lotes,
       'recebimento'::text AS origem,
       ('load ' || l.numero)::text AS rotulo,
       ''::text AS prefixo
FROM compostas c
JOIN loads l ON l.id = c.load_id
JOIN itens it ON it.id = l.item_id
LEFT JOIN fabricas fb ON fb.id = l.fabrica_id
JOIN composta_lotes cl ON cl.composta_id = c.id
JOIN recebimento_lotes rl ON rl.id = cl.recebimento_lote_id
GROUP BY c.id, l.numero, it.codigo, fb.nome
UNION ALL
SELECT c.id,
       string_agg(DISTINCT l.numero, ',' ORDER BY l.numero) AS load,
       string_agg(DISTINCT it.codigo, ',' ORDER BY it.codigo) AS item,
       string_agg(DISTINCT fb.nome, ',' ORDER BY fb.nome) AS fabrica,
       array_agg(ea.numero ORDER BY ea.numero) AS lotes,
       'embarque'::text AS origem,
       (n.nome || ' ' || n.viagem || ' linha ' || e.linha || ' fase ' || e.fase)::text AS rotulo,
       'A'::text AS prefixo
FROM compostas c
JOIN embarques e ON e.id = c.embarque_id
JOIN navios n ON n.id = e.navio_id
JOIN composta_lotes cl ON cl.composta_id = c.id
JOIN embarque_amostras ea ON ea.id = cl.embarque_amostra_id
JOIN loads l ON l.id = ea.load_id
JOIN itens it ON it.id = l.item_id
LEFT JOIN fabricas fb ON fb.id = l.fabrica_id
GROUP BY c.id, n.nome, n.viagem, e.linha, e.fase;

-- As buscas por load/lotes só olham compostas de recebimento (senão uma composta
-- de embarque com o mesmo número de load e de amostras poderia ser confundida)
CREATE OR REPLACE FUNCTION composta_por_lotes(p_load text, p_item text, p_lotes int[])
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT v.id
    FROM vw_compostas v
    WHERE v.origem = 'recebimento'
      AND v.load = p_load
      AND (NULLIF(p_item, '') IS NULL OR v.item = p_item)
      AND v.lotes = (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_lotes) AS x)
    ORDER BY v.id
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION composta_do_lote(p_load text, p_item text, p_lote int)
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT v.id
    FROM vw_compostas v
    WHERE v.origem = 'recebimento'
      AND v.load = p_load
      AND (NULLIF(p_item, '') IS NULL OR v.item = p_item)
      AND p_lote = ANY (v.lotes)
    ORDER BY v.id
    LIMIT 1
$$;

-- Embarque: p_navio é "nome + viagem" (ex: 'O.SKY 133')
--   composta_por_amostras('O.SKY 133', 2, 2, ARRAY[1,2,3,4,5]) -> composta com exatamente essas amostras
--   composta_da_amostra('O.SKY 133', 2, 2, 7)                  -> composta que contém a amostra A7
CREATE OR REPLACE FUNCTION composta_por_amostras(p_navio text, p_linha int, p_fase int, p_amostras int[])
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT v.id
    FROM vw_compostas v
    WHERE v.origem = 'embarque'
      AND upper(v.rotulo) = upper(trim(p_navio) || ' linha ' || p_linha || ' fase ' || p_fase)
      AND v.lotes = (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_amostras) AS x)
    ORDER BY v.id
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION composta_da_amostra(p_navio text, p_linha int, p_fase int, p_amostra int)
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT v.id
    FROM vw_compostas v
    WHERE v.origem = 'embarque'
      AND upper(v.rotulo) = upper(trim(p_navio) || ' linha ' || p_linha || ' fase ' || p_fase)
      AND p_amostra = ANY (v.lotes)
    ORDER BY v.id
    LIMIT 1
$$;

-- Howard: porcentagem em 50 campos, cada campo positivo vale 2% (percentual = campos_positivos x 2).
-- Um dia só, sem caldo nem estria; entra direto como 'Concluída'. Só no embarque (o bot confere).
ALTER TABLE testes ADD COLUMN campos_positivos integer CHECK (campos_positivos BETWEEN 0 AND 50);
ALTER TABLE testes ADD CONSTRAINT testes_howard_check
    CHECK (percentual IS NULL OR (tipo = 'HOWARD' AND campos_positivos IS NOT NULL AND percentual = campos_positivos * 2));

COMMIT;
