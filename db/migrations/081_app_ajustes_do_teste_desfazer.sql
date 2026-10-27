-- Desfaz a 081: os desvios da água do processo deixam de ser encerrados (a nota de quem encerrou some).

BEGIN;

ALTER TABLE app.coletas_agua_processo
    DROP CONSTRAINT IF EXISTS coletas_agua_processo_desvio_encerrado,
    DROP COLUMN IF EXISTS desvio_nota, DROP COLUMN IF EXISTS desvio_encerrado_por, DROP COLUMN IF EXISTS desvio_encerrado_em;

COMMIT;
