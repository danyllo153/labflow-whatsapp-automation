-- 071 — app (web e celular): instrução de trabalho e link do vídeo de cada app de análise (Fase E, E9)
--
-- Faixa do app (050–099). Spec: rumo-do-app.md, "Fase E" (passo E8/E9). Tarefa: APP-062. Desfazer:
-- 071_app_instrucoes_desfazer.sql. Aplicar com o administrador do banco, depois de um backup.
--
-- O texto é escrito pelo Admin no próprio app e fica SÓ no banco: o método da empresa nunca vai para o repositório.
-- Cada gravação é uma versão nova (nada se apaga nem se sobrescreve): a instrução em uso é a última de cada app, e as
-- anteriores ficam como histórico (quem escreveu e quando), como pede a rastreabilidade da 17025.

BEGIN;

CREATE TABLE app.instrucoes (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    app           text NOT NULL CHECK (app IN (
                      'recebimento-fcoj', 'tanques', 'testes', 'drops', 'embarque-fcoj', 'recebimento-nfc', 'desvios'
                  )),
    versao        int NOT NULL CHECK (versao > 0),
    texto         text NOT NULL CHECK (length(texto) <= 20000),
    video_url     text CHECK (video_url ~ '^https://[^\s]+$' AND length(video_url) <= 500),
    escrita_por   bigint NOT NULL REFERENCES usuarios (id),
    escrita_em    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (app, versao)
);

GRANT SELECT, INSERT ON app.instrucoes TO labflow_app_web;   -- sem UPDATE nem DELETE: cada mudança é uma versão nova
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
