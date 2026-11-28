-- 086 — app: quem vai no laudo, escolhido por folha e por data (pedido de 27/11)
--
-- Faixa do app (050–099). Desfazer: 086_app_nomes_no_laudo_desfazer.sql. Aplicar com o administrador do banco
-- (psql -U evolution), depois de um backup.
--
-- Com a entrada pelo nome (sem senha), o NOME do analista sai em branco nos laudos. Aqui quem lança escolhe quem vai em
-- cada folha (laudo de folha inteira, ex.: recebimento: dia NULL) ou em cada data da folha (fluxo laminar, material
-- asséptico, ciclos de esterilização). Várias pessoas podem dividir o mesmo turno, então cabe mais de um nome.
-- pagina_id é app.paginas_laudo.id, ou app.laudos_esterilizacao.id no laudo 'esterilizacao' (por isso sem chave estrangeira).

BEGIN;

CREATE TABLE app.nomes_no_laudo (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    laudo         text NOT NULL CHECK (length(laudo) BETWEEN 1 AND 60),
    pagina_id     bigint NOT NULL,
    dia           date,                                      -- NULL: a folha inteira
    pessoas       bigint[] NOT NULL CHECK (cardinality(pessoas) BETWEEN 1 AND 6),   -- usuarios.id, na ordem escolhida
    escolhido_por bigint NOT NULL REFERENCES usuarios (id),
    escolhido_em  timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE NULLS NOT DISTINCT (laudo, pagina_id, dia)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON app.nomes_no_laudo TO labflow_app_web;   -- tirar a escolha volta ao em branco
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
