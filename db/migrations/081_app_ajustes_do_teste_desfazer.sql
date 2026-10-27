-- Desfaz a 081: os desvios da água do processo deixam de ser encerrados (a nota de quem encerrou some) e as marcas de
-- TAB, Coliformes e Howard das compostas do embarque somem (o "Para fazer" volta a contar toda composta sem o teste); o
-- Admin deixa de poder apagar de vez uma coleta excluída (o que já foi apagado não volta); a atividade opcional volta a ser
-- uma atividade comum (todos os dias, herdada se não for feita).

BEGIN;

DROP FUNCTION IF EXISTS apagar_coleta_excluida(bigint, bigint, text);
ALTER TABLE app.atividades_fixas DROP COLUMN IF EXISTS opcional;
DROP TABLE IF EXISTS app.compostas_testes;

ALTER TABLE app.coletas_agua_processo
    DROP CONSTRAINT IF EXISTS coletas_agua_processo_desvio_encerrado,
    DROP COLUMN IF EXISTS desvio_nota, DROP COLUMN IF EXISTS desvio_encerrado_por, DROP COLUMN IF EXISTS desvio_encerrado_em;

COMMIT;
