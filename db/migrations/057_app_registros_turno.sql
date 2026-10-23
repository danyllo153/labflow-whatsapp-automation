-- 057 — app (web e celular): "Atividades realizadas" escritas à mão no turno (as linhas livres do relatório em Excel)
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md (v1.0), §2 Turno (central do turno). Tarefa: APP-033.
-- Desfazer: 057_app_registros_turno_desfazer.sql. Depende da 052 (turnos). Aplicar com o administrador do banco, depois de um backup.
-- Nenhuma tabela do bot é alterada. Excluir não apaga: fica guardado, com quem e quando.

BEGIN;

CREATE TABLE app.registros_turno (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    turno_id    smallint NOT NULL REFERENCES app.turnos (id),
    dia         date NOT NULL,                                   -- dia do turno (a Madrugada conta no dia em que começou)
    texto       text NOT NULL CHECK (length(trim(texto)) BETWEEN 1 AND 200),
    feita_por   bigint NOT NULL REFERENCES usuarios (id),
    feita_em    timestamptz NOT NULL DEFAULT now(),
    excluida_por bigint REFERENCES usuarios (id),
    excluida_em  timestamptz,
    CHECK ((excluida_em IS NULL) = (excluida_por IS NULL))
);

CREATE INDEX registros_turno_por_turno ON app.registros_turno (dia, turno_id) WHERE excluida_em IS NULL;

GRANT SELECT, INSERT, UPDATE ON app.registros_turno TO labflow_app_web;   -- sem DELETE: nada se apaga de verdade
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
