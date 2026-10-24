-- 063 — app (web e celular): Controle de Meio de Cultura / Fluxo Laminar (o branco do dia)
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md (v1.0), §7.5 Branco do dia. Tarefa: APP-038.
-- Desfazer: 063_app_fluxo_laminar_desfazer.sql. Depende da 060. Aplicar com o administrador do banco, depois de um backup.
--
-- Um dia de análise por linha: capela do fluxo laminar (C.T. e B.L.) e o controle de cada meio em uso (OSA, PDA,
-- Wort, PCA). "<1" por padrão; "-" no meio que não teve análise no dia. Quem salva é o responsável.

BEGIN;

CREATE TABLE app.fluxo_laminar (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dia            date NOT NULL UNIQUE,
    capela_ct      text NOT NULL DEFAULT '<1' CHECK (length(trim(capela_ct)) BETWEEN 1 AND 10),
    capela_bl      text NOT NULL DEFAULT '<1' CHECK (length(trim(capela_bl)) BETWEEN 1 AND 10),
    osa            text NOT NULL DEFAULT '<1' CHECK (length(trim(osa)) BETWEEN 1 AND 10),
    pda            text NOT NULL DEFAULT '<1' CHECK (length(trim(pda)) BETWEEN 1 AND 10),
    wort           text NOT NULL DEFAULT '-' CHECK (length(trim(wort)) BETWEEN 1 AND 10),
    pca            text NOT NULL DEFAULT '-' CHECK (length(trim(pca)) BETWEEN 1 AND 10),
    preenchido_por bigint NOT NULL REFERENCES usuarios (id),
    preenchido_em  timestamptz NOT NULL DEFAULT now(),
    pagina_id      bigint NOT NULL REFERENCES app.paginas_laudo (id)
);

GRANT SELECT, INSERT, UPDATE ON app.fluxo_laminar TO labflow_app_web;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
