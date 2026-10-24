-- 060 — app (web e celular): meios de cultura e lotes (recebimento, aceitação e lote em uso) e as páginas dos laudos novos
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md (v1.0), §7.4 Meios e lotes. Tarefa: APP-036.
-- Desfazer: 060_app_meios_lotes_desfazer.sql. Depende da 059 (app.paginas_laudo). Aplicar com o administrador do banco,
-- depois de um backup. Nenhuma tabela do bot é alterada.
--
-- `app.lotes_meio`: cada recebimento de lote de OSA, PDA, PCA ou Wort (data, lote, estado de conservação, pH,
-- observação), que preenche o laudo "Controle de Qualidade e Aceitação de Meios de Cultura" (uma folha por meio).
-- `app.uso_lote_meio`: o lote EM USO de cada meio, com o período (de/até). O lote em uso não é sempre o mais novo e um
-- lote antigo pode voltar a ser usado (decidido em 23/10): cada troca fecha o período anterior.
-- A trava de `app.paginas_laudo` passa a aceitar todos os laudos de rastreio (060 a 063).

BEGIN;

ALTER TABLE app.paginas_laudo DROP CONSTRAINT paginas_laudo_laudo_check;
ALTER TABLE app.paginas_laudo ADD CONSTRAINT paginas_laudo_laudo_check CHECK (laudo IN (
    'material-asseptico', 'meios-OSA', 'meios-PDA', 'meios-PCA', 'meios-Wort',
    'agua-processo', 'superficies-Baia', 'superficies-Linha', 'fluxo-laminar'
));

CREATE TABLE app.lotes_meio (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    meio            text NOT NULL CHECK (meio IN ('OSA', 'PDA', 'PCA', 'Wort')),
    lote            text NOT NULL CHECK (length(trim(lote)) BETWEEN 1 AND 30),
    recebido_em     date NOT NULL,
    conservacao     text NOT NULL DEFAULT 'OK' CHECK (length(trim(conservacao)) BETWEEN 1 AND 20),
    ph              text NOT NULL DEFAULT 'OK' CHECK (length(trim(ph)) BETWEEN 1 AND 20),
    observacao      text CHECK (observacao IS NULL OR length(trim(observacao)) BETWEEN 1 AND 200),
    cadastrado_por  bigint NOT NULL REFERENCES usuarios (id),
    cadastrado_em   timestamptz NOT NULL DEFAULT now(),
    excluido_por    bigint REFERENCES usuarios (id),
    excluido_em     timestamptz,
    motivo_exclusao text,
    pagina_id       bigint NOT NULL REFERENCES app.paginas_laudo (id),
    CHECK ((excluido_em IS NULL) = (excluido_por IS NULL)),
    CHECK (excluido_em IS NULL OR nullif(trim(motivo_exclusao), '') IS NOT NULL)
);
CREATE UNIQUE INDEX lotes_meio_sem_repetir ON app.lotes_meio (meio, lower(trim(lote)), recebido_em) WHERE excluido_em IS NULL;

CREATE TABLE app.uso_lote_meio (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    meio         text NOT NULL CHECK (meio IN ('OSA', 'PDA', 'PCA', 'Wort')),
    lote_meio_id bigint NOT NULL REFERENCES app.lotes_meio (id),
    desde        timestamptz NOT NULL DEFAULT now(),
    ate          timestamptz,
    marcado_por  bigint NOT NULL REFERENCES usuarios (id),
    CHECK (ate IS NULL OR ate >= desde)
);
CREATE UNIQUE INDEX uso_lote_meio_um_em_uso ON app.uso_lote_meio (meio) WHERE ate IS NULL;  -- um lote em uso por meio

GRANT SELECT, INSERT, UPDATE ON app.lotes_meio, app.uso_lote_meio TO labflow_app_web;   -- sem DELETE
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
