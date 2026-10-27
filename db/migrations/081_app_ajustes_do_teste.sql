-- 081 — app: ajustes pedidos pelo Danyllo em 27/10, depois de testar o app no ar (#337)
--
-- Faixa do app (050–099). Desfazer: 081_app_ajustes_do_teste_desfazer.sql. Aplicar com o administrador do banco, depois de
-- um backup.
--
-- - água do processo: desvio é a coleta com crescimento (C.T. ou B.L. com número maior que zero; "<1" não conta). Fica
--   aberto até alguém encerrar, com uma nota (quem e quando ficam guardados).
-- - compostas_testes: o que cada composta do EMBARQUE (navio) vai fazer, marcado pelo analista ao criar a composta ou
--   depois (TAB, Coliformes, Howard). É o que conta no "Para fazer" do TAB, do Coliformes e do Howard. O recebimento
--   segue a regra do banco (104): TAB em toda composta; Coliformes na primeira composta de cada load e em toda composta
--   da COL. Composta do embarque sem marca (as de antes): Coliformes pela 104 (toda composta), Howard sim, TAB não.

BEGIN;

ALTER TABLE app.coletas_agua_processo
    ADD COLUMN desvio_encerrado_em  timestamptz,
    ADD COLUMN desvio_encerrado_por bigint REFERENCES usuarios (id),
    ADD COLUMN desvio_nota          text CHECK (desvio_nota IS NULL OR length(trim(desvio_nota)) BETWEEN 1 AND 300),
    ADD CONSTRAINT coletas_agua_processo_desvio_encerrado CHECK ((desvio_encerrado_em IS NULL) = (desvio_encerrado_por IS NULL));

CREATE TABLE app.compostas_testes (
    composta_id bigint PRIMARY KEY REFERENCES compostas (id) ON DELETE CASCADE,
    tab         boolean NOT NULL DEFAULT false,
    coliformes  boolean NOT NULL DEFAULT true,
    howard      boolean NOT NULL DEFAULT false,
    marcado_por bigint REFERENCES usuarios (id),
    marcado_em  timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT, INSERT, UPDATE ON app.compostas_testes TO labflow_app_web;

COMMIT;
