-- 062 — app (web e celular): limpeza de superfícies, baias (CIP dos mangotes) e linhas (CIP das linhas de embarque)
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md (v1.0), §5.1 Águas (aba Páginas). Tarefa: APP-037.
-- Desfazer: 062_app_superficies_desfazer.sql. Depende da 060. Aplicar com o administrador do banco, depois de um backup.
--
-- Uma coleta por ponto (Baia 08, Linha 4): data e hora, dia da análise (plaqueamento), C.T. 48 h, B.L. 72 h e 120 h
-- (texto livre, vazio = ainda não lido). Uma folha do laudo para baias e outra para linhas. Excluir não apaga.

BEGIN;

CREATE TABLE app.coletas_superficie (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo            text NOT NULL CHECK (tipo IN ('Baia', 'Linha')),
    ponto           text NOT NULL CHECK (length(trim(ponto)) BETWEEN 1 AND 10),
    coletada_em     timestamptz NOT NULL,
    analisada_em    date NOT NULL,                     -- dia em que foi plaqueada ("Análise dd.mm.aa" no laudo)
    ct_48           text CHECK (ct_48 IS NULL OR length(trim(ct_48)) BETWEEN 1 AND 10),
    bl_72           text CHECK (bl_72 IS NULL OR length(trim(bl_72)) BETWEEN 1 AND 10),
    bl_120          text CHECK (bl_120 IS NULL OR length(trim(bl_120)) BETWEEN 1 AND 10),
    observacao      text CHECK (observacao IS NULL OR length(trim(observacao)) BETWEEN 1 AND 60),
    coletada_por    bigint NOT NULL REFERENCES usuarios (id),
    registrada_em   timestamptz NOT NULL DEFAULT now(),
    resultado_por   bigint REFERENCES usuarios (id),
    resultado_em    timestamptz,
    excluida_por    bigint REFERENCES usuarios (id),
    excluida_em     timestamptz,
    motivo_exclusao text,
    pagina_id       bigint NOT NULL REFERENCES app.paginas_laudo (id),
    CHECK ((excluida_em IS NULL) = (excluida_por IS NULL)),
    CHECK (excluida_em IS NULL OR nullif(trim(motivo_exclusao), '') IS NOT NULL)
);
CREATE INDEX coletas_superficie_por_data ON app.coletas_superficie (tipo, coletada_em) WHERE excluida_em IS NULL;

GRANT SELECT, INSERT, UPDATE ON app.coletas_superficie TO labflow_app_web;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
