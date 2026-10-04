-- 006 — testes por lote (confirmação de Coliformes abrindo a composta)
--
-- Depende da 002. Na confirmação, a composta de Coliformes é "aberta": cada
-- lote vira um teste próprio, ligado ao teste da composta (teste_pai_id).

BEGIN;

ALTER TABLE testes ADD COLUMN recebimento_lote_id bigint REFERENCES recebimento_lotes (id) ON DELETE CASCADE;
ALTER TABLE testes ADD COLUMN teste_pai_id bigint REFERENCES testes (id) ON DELETE CASCADE;

-- o teste é de exatamente um alvo: composta, tanque (coleta) ou lote
ALTER TABLE testes DROP CONSTRAINT testes_check;
ALTER TABLE testes ADD CONSTRAINT testes_alvo_check CHECK (num_nonnulls(composta_id, coleta_id, recebimento_lote_id) = 1);
-- teste de lote sempre tem pai, e só ele
ALTER TABLE testes ADD CONSTRAINT testes_lote_pai_check CHECK ((recebimento_lote_id IS NULL) = (teste_pai_id IS NULL));
ALTER TABLE testes ADD CONSTRAINT testes_tipo_lote_key UNIQUE (tipo, recebimento_lote_id);

COMMIT;
