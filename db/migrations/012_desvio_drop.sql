-- 012 — desvio de drop
--
-- Depende da 001. Drop "não ok": o analista abre um desvio (com "sim") e o drop
-- de arquivo é repetido em 3 temperaturas (7, 13 e 25 °C) por até 5 dias. O
-- resultado pode sair antes: confirmou em uma ou mais temperaturas, ou não
-- confirmou. O drop é rastreado pela coleta. Um desvio por drop.

BEGIN;

CREATE TABLE desvios_drop (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    drop_id           bigint NOT NULL UNIQUE REFERENCES drops (id) ON DELETE CASCADE,
    data_abertura     date NOT NULL,
    leitura_prevista  date NOT NULL,                 -- abertura + 5 dias (prazo máximo)
    aberto_por        bigint REFERENCES usuarios (id),
    aberto_em         timestamptz NOT NULL DEFAULT now(),
    status            text NOT NULL DEFAULT 'Em confirmação' CHECK (status IN ('Em confirmação', 'Concluído')),
    resultado         text CHECK (resultado IN ('Confirmado', 'Não confirmado')),
    temperaturas      integer[] NOT NULL DEFAULT '{}' CHECK (temperaturas <@ ARRAY[7, 13, 25]),
    resultado_por     bigint REFERENCES usuarios (id),
    resultado_em      timestamptz,
    CHECK ((status = 'Concluído') = (resultado IS NOT NULL)),
    CHECK ((resultado = 'Confirmado') = (cardinality(temperaturas) > 0))
);

CREATE INDEX desvios_drop_abertos ON desvios_drop (leitura_prevista) WHERE status = 'Em confirmação';

-- desvio com tudo o que a consulta e o relatório precisam
CREATE OR REPLACE VIEW vw_desvios_drop AS
SELECT x.id,
       x.drop_id,
       d.dia,
       d.data_prevista AS drop_previsto,
       c.origem,
       c.tanque,
       trim(n.nome || ' ' || n.viagem) AS navio,
       c.data_coleta,
       x.data_abertura,
       x.leitura_prevista,
       x.status,
       x.resultado,
       x.temperaturas,
       ua.nome AS aberto_por,
       x.aberto_em,
       ur.nome AS resultado_por,
       x.resultado_em
FROM desvios_drop x
JOIN drops d ON d.id = x.drop_id
JOIN coletas c ON c.id = d.coleta_id
LEFT JOIN navios n ON n.id = c.navio_id
LEFT JOIN usuarios ua ON ua.id = x.aberto_por
LEFT JOIN usuarios ur ON ur.id = x.resultado_por;

-- pendência do "sim/não" para abrir e fechar desvio
ALTER TABLE confirmacoes DROP CONSTRAINT confirmacoes_tipo_check;
ALTER TABLE confirmacoes ADD CONSTRAINT confirmacoes_tipo_check CHECK (tipo IN ('LEITURA', 'IA', 'TAB', 'DIA', 'DESVIO'));

COMMIT;
