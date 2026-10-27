-- 081 — app: ajustes pedidos pelo Danyllo em 27/10, depois de testar o app no ar (#337)
--
-- Faixa do app (050–099). Desfazer: 081_app_ajustes_do_teste_desfazer.sql. Aplicar com o administrador do banco, depois de
-- um backup.
--
-- - água do processo: desvio é a coleta com crescimento (C.T. ou B.L. com número maior que zero; "<1" não conta). Fica
--   aberto até alguém encerrar, com uma nota (quem e quando ficam guardados).

BEGIN;

ALTER TABLE app.coletas_agua_processo
    ADD COLUMN desvio_encerrado_em  timestamptz,
    ADD COLUMN desvio_encerrado_por bigint REFERENCES usuarios (id),
    ADD COLUMN desvio_nota          text CHECK (desvio_nota IS NULL OR length(trim(desvio_nota)) BETWEEN 1 AND 300),
    ADD CONSTRAINT coletas_agua_processo_desvio_encerrado CHECK ((desvio_encerrado_em IS NULL) = (desvio_encerrado_por IS NULL));

COMMIT;
