-- 054 — app (web e celular): esterilizações (ponteira, meio, frasco, descarte, outro)
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md (v1.0), §7 Esterilização e §6 gráfico G4; 08 A8. Tarefa: APP-026.
-- Desfazer: 054_app_esterilizacao_desfazer.sql. Depende da 052 (turnos). Aplicar com o administrador do banco, depois de um backup.
-- Nenhuma tabela do bot é alterada. Sem resultado da fita (o ok/não ok sai da nota da autoclave); a anotação no
-- Word continua como rastreio oficial. Excluir não apaga: fica guardado, com quem, quando e o motivo.

BEGIN;

CREATE TABLE app.esterilizacoes (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo            text NOT NULL CHECK (tipo IN ('Ponteira', 'Meio', 'Frasco', 'Descarte', 'Outro')),
    ciclo           text NOT NULL CHECK (length(trim(ciclo)) BETWEEN 1 AND 20),
    meio            text CHECK (meio IS NULL OR length(trim(meio)) BETWEEN 1 AND 60),       -- só no tipo Meio (ex.: PDA)
    descricao       text CHECK (descricao IS NULL OR length(trim(descricao)) BETWEEN 1 AND 120),  -- obrigatória no tipo Outro
    turno_id        smallint NOT NULL REFERENCES app.turnos (id),
    dia             date NOT NULL,                                   -- dia do turno (a Madrugada conta no dia em que começou)
    feita_por       bigint NOT NULL REFERENCES usuarios (id),
    feita_em        timestamptz NOT NULL DEFAULT now(),
    antes           text,                                            -- o que estava escrito antes da última correção
    corrigida_por   bigint REFERENCES usuarios (id),
    corrigida_em    timestamptz,
    motivo_correcao text,
    excluida_por    bigint REFERENCES usuarios (id),
    excluida_em     timestamptz,
    motivo_exclusao text,
    CHECK (tipo <> 'Outro' OR descricao IS NOT NULL),
    CHECK ((corrigida_em IS NULL) = (corrigida_por IS NULL)),
    CHECK (corrigida_em IS NULL OR nullif(trim(motivo_correcao), '') IS NOT NULL),    -- corrigir pede motivo
    CHECK ((excluida_em IS NULL) = (excluida_por IS NULL)),
    CHECK (excluida_em IS NULL OR nullif(trim(motivo_exclusao), '') IS NOT NULL)      -- excluir pede motivo
);

CREATE INDEX esterilizacoes_por_turno ON app.esterilizacoes (dia, turno_id) WHERE excluida_em IS NULL;

GRANT SELECT, INSERT, UPDATE ON app.esterilizacoes TO labflow_app_web;   -- sem DELETE: nada se apaga de verdade
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
