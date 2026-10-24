-- 061 — app (web e celular): análise da água do processo (Manifold e Câmaras 4, 5 e 6) e o laudo
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md (v1.0), §5.1 Águas (aba Páginas). Tarefa: APP-037.
-- Desfazer: 061_app_agua_processo_desfazer.sql. Depende da 060. Aplicar com o administrador do banco, depois de um backup.
--
-- Uma coleta (data e hora) com os pontos coletados; C.T. (PCA, 48 h) e B.L. (PDA, 120 h) de cada ponto: texto livre
-- ("<1", número), vazio = ainda não lido; ponto não coletado sai "-" no laudo. Excluir não apaga.

BEGIN;

CREATE TABLE app.coletas_agua_processo (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coletada_em     timestamptz NOT NULL,
    manifold        boolean NOT NULL DEFAULT false,
    camara4         boolean NOT NULL DEFAULT false,
    camara5         boolean NOT NULL DEFAULT false,
    camara6         boolean NOT NULL DEFAULT false,
    ct_manifold     text CHECK (ct_manifold IS NULL OR length(trim(ct_manifold)) BETWEEN 1 AND 10),
    bl_manifold     text CHECK (bl_manifold IS NULL OR length(trim(bl_manifold)) BETWEEN 1 AND 10),
    ct_camara4      text CHECK (ct_camara4 IS NULL OR length(trim(ct_camara4)) BETWEEN 1 AND 10),
    bl_camara4      text CHECK (bl_camara4 IS NULL OR length(trim(bl_camara4)) BETWEEN 1 AND 10),
    ct_camara5      text CHECK (ct_camara5 IS NULL OR length(trim(ct_camara5)) BETWEEN 1 AND 10),
    bl_camara5      text CHECK (bl_camara5 IS NULL OR length(trim(bl_camara5)) BETWEEN 1 AND 10),
    ct_camara6      text CHECK (ct_camara6 IS NULL OR length(trim(ct_camara6)) BETWEEN 1 AND 10),
    bl_camara6      text CHECK (bl_camara6 IS NULL OR length(trim(bl_camara6)) BETWEEN 1 AND 10),
    observacao      text CHECK (observacao IS NULL OR length(trim(observacao)) BETWEEN 1 AND 60),
    coletada_por    bigint NOT NULL REFERENCES usuarios (id),
    registrada_em   timestamptz NOT NULL DEFAULT now(),
    resultado_por   bigint REFERENCES usuarios (id),
    resultado_em    timestamptz,
    excluida_por    bigint REFERENCES usuarios (id),
    excluida_em     timestamptz,
    motivo_exclusao text,
    pagina_id       bigint NOT NULL REFERENCES app.paginas_laudo (id),
    CHECK (manifold OR camara4 OR camara5 OR camara6),
    CHECK ((excluida_em IS NULL) = (excluida_por IS NULL)),
    CHECK (excluida_em IS NULL OR nullif(trim(motivo_exclusao), '') IS NOT NULL)
);
CREATE INDEX coletas_agua_processo_por_data ON app.coletas_agua_processo (coletada_em) WHERE excluida_em IS NULL;

GRANT SELECT, INSERT, UPDATE ON app.coletas_agua_processo TO labflow_app_web;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
