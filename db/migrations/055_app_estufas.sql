-- 055 — app (web e celular): temperatura das estufas (conferência por turno)
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md (v1.0), §7.1 Temperatura das estufas; 08 A8. Tarefa: APP-027.
-- Desfazer: 055_app_estufas_desfazer.sql. Depende da 052 (turnos). Aplicar com o administrador do banco, depois de um backup.
-- Nenhuma tabela do bot é alterada.
--
-- As 11 estufas (01, 02, 03, 04, 06, 07, 08, 09, 10, 11 e 12; não existe a 05; a 06 é auxiliar, sem faixa) vêm aqui.
-- As FAIXAS DE TRABALHO (mínimo e máximo) são confidenciais: ficam só no banco, cadastradas pelo Admin (APP-028) ou
-- carregadas por um arquivo fora do Git. O repositório só tem os valores fictícios de db/seeds/faixas_estufa_exemplo.sql.

BEGIN;

CREATE TABLE app.estufas (
    id         smallint PRIMARY KEY,                -- o número da estufa (01 a 12, sem a 05)
    auxiliar   boolean NOT NULL DEFAULT false,      -- sem faixa de trabalho, mas com as duas leituras
    ativa      boolean NOT NULL DEFAULT true
);

INSERT INTO app.estufas (id, auxiliar) VALUES
    (1, false), (2, false), (3, false), (4, false), (6, true), (7, false), (8, false), (9, false), (10, false), (11, false), (12, false);

-- Faixa de trabalho com vigência: a leitura compara com a faixa vigente no dia do turno
CREATE TABLE app.faixas_estufa (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estufa_id      smallint NOT NULL REFERENCES app.estufas (id),
    minimo         numeric(4, 1) NOT NULL,
    maximo         numeric(4, 1) NOT NULL,
    vigente_desde  date NOT NULL DEFAULT CURRENT_DATE,
    vigente_ate    date,
    criada_por     bigint REFERENCES usuarios (id),
    criada_em      timestamptz NOT NULL DEFAULT now(),
    CHECK (maximo > minimo),
    CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_desde),
    UNIQUE (estufa_id, vigente_desde)
);

-- Uma conferência por estufa, leitura (supervisório ou field chart), turno e dia; conferir de novo atualiza
CREATE TABLE app.leituras_estufa (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estufa_id    smallint NOT NULL REFERENCES app.estufas (id),
    leitura      text NOT NULL CHECK (leitura IN ('Supervisório', 'Field chart')),
    ok           boolean NOT NULL,
    temperatura  numeric(4, 1),                     -- só no Não ok (°C, uma casa decimal)
    observacao   text CHECK (observacao IS NULL OR length(trim(observacao)) BETWEEN 1 AND 200),
    turno_id     smallint NOT NULL REFERENCES app.turnos (id),
    dia          date NOT NULL,                     -- dia do turno (a Madrugada conta no dia em que começou)
    feita_por    bigint NOT NULL REFERENCES usuarios (id),
    feita_em     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (estufa_id, leitura, turno_id, dia),
    CHECK (ok OR temperatura IS NOT NULL),          -- Não ok pede a temperatura
    CHECK (NOT ok OR temperatura IS NULL)           -- Ok não guarda número
);

CREATE INDEX leituras_estufa_por_turno ON app.leituras_estufa (dia, turno_id);

GRANT SELECT, INSERT, UPDATE ON app.estufas, app.faixas_estufa, app.leituras_estufa TO labflow_app_web;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
