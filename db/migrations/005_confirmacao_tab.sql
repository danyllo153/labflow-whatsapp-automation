-- 005 — confirmações "sim/não" também para o TAB
--
-- Depende da 001. O payload do tipo TAB é {acao: 'espalhar' | 'negativos' | 'resultado',
-- ids: [testes.id...], resultado?: 'Positivo' | 'Negativo'}.

BEGIN;

ALTER TABLE confirmacoes DROP CONSTRAINT confirmacoes_tipo_check;
ALTER TABLE confirmacoes ADD CONSTRAINT confirmacoes_tipo_check CHECK (tipo IN ('LEITURA', 'IA', 'TAB'));

COMMIT;
