-- 011 — leitura do dia finalizada
--
-- Depende da 001. Uma pessoa lê por dia: "leitura do dia finalizada" marca como
-- lido tudo o que sai hoje (leituras de NFC, drops, TAB e Coliformes sem
-- crescimento) e registra quem finalizou, para o relatório do dia mostrar.
-- C.T/B.L do concentrado continuam pendentes até o valor ser digitado.

BEGIN;

CREATE TABLE leituras_finalizadas (
    dia            date PRIMARY KEY,
    usuario_id     bigint REFERENCES usuarios (id),
    finalizado_em  timestamptz NOT NULL DEFAULT now()
);

-- pendência do "sim/não" para finalizar o dia
ALTER TABLE confirmacoes DROP CONSTRAINT confirmacoes_tipo_check;
ALTER TABLE confirmacoes ADD CONSTRAINT confirmacoes_tipo_check CHECK (tipo IN ('LEITURA', 'IA', 'TAB', 'DIA'));

COMMIT;
