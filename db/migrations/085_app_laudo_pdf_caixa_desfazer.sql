-- Desfaz a 085: apaga os PDFs dos laudos das caixas da planilha (só com backup; tire antes o botão do app) e devolve a
-- tabela vazia da 084.

BEGIN;

DROP TABLE IF EXISTS app.arquivo_laudo_pdf;

CREATE TABLE app.arquivo_conteudo_planilha (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    carga_id    bigint NOT NULL,
    tipo        text NOT NULL CHECK (tipo IN ('fcoj', 'pote')),
    loads       text CHECK (loads IS NULL OR loads ~ '^[0-9]{1,10}(/[0-9]{1,10}){0,19}$'),
    tanque      text CHECK (tanque IS NULL OR tanque ~ '^[0-9]{1,2}[A-Z]{0,2}$'),
    quantidade  integer NOT NULL CHECK (quantidade BETWEEN 1 AND 99),
    criada_por  bigint NOT NULL REFERENCES usuarios (id),
    criada_em   timestamptz NOT NULL DEFAULT clock_timestamp(),
    apagada_em  timestamptz,
    apagada_por bigint REFERENCES usuarios (id),
    CHECK ((tipo = 'fcoj') = (loads IS NOT NULL)),
    CHECK ((tipo = 'pote') = (tanque IS NOT NULL)),
    CHECK ((apagada_em IS NULL) = (apagada_por IS NULL))
);
CREATE INDEX arquivo_conteudo_planilha_carga ON app.arquivo_conteudo_planilha (carga_id) WHERE apagada_em IS NULL;

GRANT SELECT, INSERT ON app.arquivo_conteudo_planilha TO labflow_app_web;
GRANT UPDATE (apagada_em, apagada_por) ON app.arquivo_conteudo_planilha TO labflow_app_web;

COMMIT;
