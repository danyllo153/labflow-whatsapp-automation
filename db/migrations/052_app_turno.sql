-- 052 — app (web e celular): o turno (entrar e sair, relatório do turno, atividades fixas e o que foi feito)
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md (v1.0), §2 Entrar no turno, §3 Início, §4 Relatório do turno, "Tabelas do app".
-- Tarefa: APP-021. Desfazer: 052_app_turno_desfazer.sql. Depende da 050 (schema app e papel labflow_app_web).
-- Aplicar com o usuário administrador do banco, depois de um backup.
--
-- Nenhuma tabela do bot é alterada: as tabelas novas só apontam para usuarios(id).
-- Regras de data (07 §4): a Madrugada conta no dia em que COMEÇA (00:00); a Tarde vai até 00:00 do dia seguinte.
-- Os horários padrão e as atividades fixas abaixo são o ponto de partida; o Admin muda depois (APP-028).

BEGIN;

-- Turnos e o horário padrão (revezamento 7 dias por semana, decidido em 15/10) ----------------------------------
CREATE TABLE app.turnos (
    id      smallint PRIMARY KEY,
    nome    text NOT NULL UNIQUE CHECK (nome IN ('Manhã', 'Tarde', 'Madrugada')),
    inicio  time NOT NULL,
    fim     time NOT NULL,                       -- a Tarde termina às 00:00 (do dia seguinte)
    ordem   smallint NOT NULL UNIQUE
);

INSERT INTO app.turnos (id, nome, inicio, fim, ordem) VALUES
    (1, 'Manhã',     '08:00', '16:00', 1),
    (2, 'Tarde',     '16:00', '00:00', 2),
    (3, 'Madrugada', '00:00', '08:00', 3);

-- Quem entrou em qual turno e dia (07 §2): a própria pessoa edita a entrada e a saída -----------------------------
CREATE TABLE app.entradas_turno (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id  bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    turno_id    smallint NOT NULL REFERENCES app.turnos (id),
    dia         date NOT NULL,                   -- dia do turno (Madrugada: o dia em que começou)
    entrada     timestamptz NOT NULL,
    saida       timestamptz,                     -- "Sair do turno"; nulo enquanto está no turno
    criada_em   timestamptz NOT NULL DEFAULT now(),
    editada_em  timestamptz,
    UNIQUE (usuario_id, turno_id, dia),
    CHECK (saida IS NULL OR saida > entrada)
);

CREATE INDEX entradas_turno_por_turno ON app.entradas_turno (dia, turno_id);
-- no máximo um turno aberto por pessoa
CREATE UNIQUE INDEX entradas_turno_uma_aberta ON app.entradas_turno (usuario_id) WHERE saida IS NULL;

-- Relatório do turno (07 §4): uma linha por turno e dia; o automático é calculado na hora, aqui fica o escrito à mão ----
CREATE TABLE app.relatorios_turno (
    id                        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    turno_id                  smallint NOT NULL REFERENCES app.turnos (id),
    dia                       date NOT NULL,
    pendencias_escritas       text CHECK (pendencias_escritas IS NULL OR length(pendencias_escritas) <= 4000),
    esterilizacoes_pendentes  text CHECK (esterilizacoes_pendentes IS NULL OR length(esterilizacoes_pendentes) <= 2000),
    ocorrencias               text CHECK (ocorrencias IS NULL OR length(ocorrencias) <= 4000),
    analistas_extras          text CHECK (analistas_extras IS NULL OR length(analistas_extras) <= 500),  -- quem estava e não entrou pelo app
    encerrado_por             bigint REFERENCES usuarios (id),
    encerrado_em              timestamptz,
    encerramento_automatico   boolean NOT NULL DEFAULT false,   -- ninguém encerrou: fechou quando o próximo começou
    reaberto_por              bigint REFERENCES usuarios (id),
    reaberto_em               timestamptz,
    motivo_reabertura         text,
    atualizado_por            bigint REFERENCES usuarios (id),
    atualizado_em             timestamptz NOT NULL DEFAULT now(),
    UNIQUE (turno_id, dia),
    CHECK (encerrado_em IS NULL OR encerrado_por IS NOT NULL OR encerramento_automatico),
    CHECK ((reaberto_em IS NULL) = (reaberto_por IS NULL)),
    CHECK (reaberto_em IS NULL OR nullif(trim(motivo_reabertura), '') IS NOT NULL)   -- reabrir pede motivo (Admin)
);

-- Atividades fixas de cada turno (07 §3): lista de verificação; dias_semana nulo = todos os dias (1 = segunda ... 7 = domingo)
CREATE TABLE app.atividades_fixas (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    turno_id     smallint NOT NULL REFERENCES app.turnos (id),
    texto        text NOT NULL CHECK (length(trim(texto)) BETWEEN 1 AND 120),
    dias_semana  smallint[] CHECK (dias_semana IS NULL OR (cardinality(dias_semana) > 0 AND dias_semana <@ ARRAY[1,2,3,4,5,6,7]::smallint[])),
    ordem        smallint NOT NULL,
    ativa        boolean NOT NULL DEFAULT true,  -- desativar em vez de apagar: o que já foi marcado continua com o texto certo
    criada_por   bigint REFERENCES usuarios (id),
    criada_em    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (turno_id, ordem)
);

-- Lista inicial passada pelo Danyllo em 16/10 (07 §3, "Atividades fixas de cada turno")
INSERT INTO app.atividades_fixas (turno_id, texto, dias_semana, ordem) VALUES
    (1, 'Leitura de placa', NULL, 1),
    (1, 'Planilhas', NULL, 2),
    (1, 'Materiais', NULL, 3),
    (1, 'Meios de cultura', NULL, 4),
    (1, 'Drops', NULL, 5),
    (1, 'Análise dos TQs', NULL, 6),
    (1, 'Howard', NULL, 7),
    (1, '5S / Limpeza e organização', NULL, 8),
    (1, 'Reagentes', NULL, 9),
    (1, 'Calibração', NULL, 10),
    (1, 'Conservação bicicletas', NULL, 11),
    (2, 'Análise de TAB / Enriquecimento SP', NULL, 1),
    (2, 'Registro diário', NULL, 2),
    (2, 'Análise NFC recebimento', NULL, 3),
    (2, 'Monitoramento ambiental', NULL, 4),
    (2, 'Análise sanitizante + TK 30 (água)', NULL, 5),
    (2, 'Arquivo microrganismo (C4)', NULL, 6),
    (2, 'Day Tank', NULL, 7),
    (2, '5S / Limpeza e organização', NULL, 8),
    (3, 'Análise recebimento / embarque', NULL, 1),
    (3, 'Coliformes Colina', NULL, 2),
    (3, 'Coliformes demais fábricas', ARRAY[5]::smallint[], 3),   -- só às sextas
    (3, 'Análise pH PDA e Meio BAT', NULL, 4),
    (3, 'Água do processo', NULL, 5),
    (3, 'Plaquear (WORT, PCA, MB, YEGCA, Cr.ES)', NULL, 6),
    (3, '5S / Limpeza e organização', NULL, 7);

-- Feito / Não feito de uma atividade fixa ou de uma pendência herdada escrita à mão (07 §3, 08 A9) ---------------------
CREATE TABLE app.atividades_feitas (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    atividade_fixa_id   bigint REFERENCES app.atividades_fixas (id),
    pendencia_texto     text CHECK (pendencia_texto IS NULL OR length(trim(pendencia_texto)) BETWEEN 1 AND 300),
    turno_id            smallint NOT NULL REFERENCES app.turnos (id),
    dia                 date NOT NULL,
    feito               boolean NOT NULL,        -- false = "Não feito": passa como pendência para o próximo turno
    marcado_por         bigint NOT NULL REFERENCES usuarios (id),
    marcado_em          timestamptz NOT NULL DEFAULT now(),
    CHECK ((atividade_fixa_id IS NULL) <> (pendencia_texto IS NULL))
);

-- uma marcação por atividade fixa em cada turno e dia (marcar de novo atualiza)
CREATE UNIQUE INDEX atividades_feitas_uma_por_turno ON app.atividades_feitas (atividade_fixa_id, turno_id, dia)
    WHERE atividade_fixa_id IS NOT NULL;
CREATE INDEX atividades_feitas_por_turno ON app.atividades_feitas (dia, turno_id);

-- Permissões do labflow_app_web nas tabelas novas (o GRANT da 050 valeu só para as tabelas que existiam) -----------
GRANT SELECT ON app.turnos TO labflow_app_web;                    -- horários: o Admin muda pela API (APP-028)
GRANT UPDATE (inicio, fim) ON app.turnos TO labflow_app_web;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.entradas_turno, app.relatorios_turno, app.atividades_fixas,
    app.atividades_feitas TO labflow_app_web;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
