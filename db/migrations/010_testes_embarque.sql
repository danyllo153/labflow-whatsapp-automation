-- 010 — testes por amostra de embarque (Coliformes aberto amostra por amostra)
--
-- Depende da 008 (embarque_amostras) e da 006 (testes por lote). Aplicar com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 010_testes_embarque.sql
--
-- No recebimento, a confirmação de Coliformes abre a composta lote a lote (006). No embarque
-- é igual, mas por amostra: cada amostra da composta vira um teste filho.

BEGIN;

ALTER TABLE testes ADD COLUMN embarque_amostra_id bigint REFERENCES embarque_amostras (id) ON DELETE CASCADE;

-- o teste é de exatamente um alvo: composta, tanque (coleta), lote ou amostra
ALTER TABLE testes DROP CONSTRAINT testes_alvo_check;
ALTER TABLE testes ADD CONSTRAINT testes_alvo_check
    CHECK (num_nonnulls(composta_id, coleta_id, recebimento_lote_id, embarque_amostra_id) = 1);

-- teste de lote ou de amostra sempre tem pai, e só ele
ALTER TABLE testes DROP CONSTRAINT testes_lote_pai_check;
ALTER TABLE testes ADD CONSTRAINT testes_lote_pai_check
    CHECK ((recebimento_lote_id IS NULL AND embarque_amostra_id IS NULL) = (teste_pai_id IS NULL));

ALTER TABLE testes ADD CONSTRAINT testes_tipo_amostra_key UNIQUE (tipo, embarque_amostra_id);

COMMIT;
