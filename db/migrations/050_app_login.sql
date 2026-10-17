-- 050 — app (web e celular): schema "app" com as tabelas do login e o usuário de banco do app
--
-- Primeira migration do APP (faixa 050 em diante; 027–049 são da sessão do bot).
-- Spec: docs/specs/lims/06-api-e-auth.md (v1.0), "Tabelas do login" e "Arquitetura". Tarefa: APP-003.
-- Desfazer: 050_app_login_desfazer.sql.
--
-- Cria o papel labflow_app_web SEM LOGIN e SEM SENHA (nada de senha no repositório). Para a API entrar no
-- servidor, o Admin do banco liga o login uma vez, com a senha guardada só no ~/labflow/.env:
--   ALTER ROLE labflow_app_web LOGIN PASSWORD '<senha do .env>';
-- Precisa ser aplicada pelo usuário administrador do banco (cria papel e dá permissões).
--
-- O que o labflow_app_web pode:
--   - LER as tabelas e views do bot (schemas public e bi);
--   - LER e GRAVAR só nas tabelas do schema app.
-- Ele NÃO grava nas tabelas do bot: a gravação nelas será só por funções do banco aprovadas (PB4, PB5).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'labflow_app_web') THEN
    CREATE ROLE labflow_app_web NOLOGIN;
  END IF;
END $$;

CREATE SCHEMA app;

-- Credencial de cada pessoa no app (a pessoa em si continua em usuarios, que é do bot) --------------------
CREATE TABLE app.credenciais (
    usuario_id          bigint PRIMARY KEY REFERENCES usuarios (id) ON DELETE CASCADE,
    usuario             text NOT NULL UNIQUE
                        CHECK (usuario ~ '^[a-z0-9]([a-z0-9._-]{1,38})[a-z0-9]$'),   -- ex.: ana.souza
    senha_hash          text,                                -- argon2; nulo até a primeira senha própria
    trocar_senha        boolean NOT NULL DEFAULT true,       -- obriga a trocar no próximo login
    tentativas_erradas  smallint NOT NULL DEFAULT 0 CHECK (tentativas_erradas >= 0),
    bloqueado_ate       timestamptz,                         -- 5 erros seguidos: 15 minutos
    acesso_ativo        boolean NOT NULL DEFAULT true,       -- o Admin pode bloquear o acesso ao app
    criado_em           timestamptz NOT NULL DEFAULT now(),
    atualizado_em       timestamptz NOT NULL DEFAULT now()
);

-- Senha provisória gerada pelo Admin (primeiro acesso e esqueci a senha): 24 h, uso único -----------------
CREATE TABLE app.senhas_provisorias (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id    bigint NOT NULL REFERENCES app.credenciais (usuario_id) ON DELETE CASCADE,
    senha_hash    text NOT NULL,
    gerada_por    bigint NOT NULL REFERENCES usuarios (id),
    gerada_em     timestamptz NOT NULL DEFAULT now(),
    valida_ate    timestamptz NOT NULL DEFAULT now() + interval '24 hours',
    usada_em      timestamptz,
    cancelada_em  timestamptz,                               -- uma nova provisória cancela a anterior
    CHECK (valida_ate > gerada_em),
    CHECK (usada_em IS NULL OR cancelada_em IS NULL)
);

-- No máximo uma provisória em aberto por pessoa
CREATE UNIQUE INDEX senhas_provisorias_uma_aberta
    ON app.senhas_provisorias (usuario_id) WHERE usada_em IS NULL AND cancelada_em IS NULL;

-- Sessões (cookie): até "Sair" ou 30 dias sem uso (a API confere ultimo_uso_em) --------------------------
CREATE TABLE app.sessoes (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_hash     text NOT NULL UNIQUE,                     -- só o hash; o token fica no cookie
    usuario_id     bigint NOT NULL REFERENCES app.credenciais (usuario_id) ON DELETE CASCADE,
    criada_em      timestamptz NOT NULL DEFAULT now(),
    ultimo_uso_em  timestamptz NOT NULL DEFAULT now(),
    encerrada_em   timestamptz,                              -- "Sair"
    aparelho       text CHECK (aparelho IS NULL OR length(aparelho) <= 200)
);

CREATE INDEX sessoes_por_usuario ON app.sessoes (usuario_id) WHERE encerrada_em IS NULL;

-- Permissões do labflow_app_web ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public, bi TO labflow_app_web;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO labflow_app_web;
GRANT SELECT ON ALL TABLES IN SCHEMA bi TO labflow_app_web;
-- Tabelas e views que o bot criar depois (o bot migra como labflow_app) também ficam legíveis
ALTER DEFAULT PRIVILEGES FOR ROLE labflow_app IN SCHEMA public GRANT SELECT ON TABLES TO labflow_app_web;
ALTER DEFAULT PRIVILEGES FOR ROLE labflow_app IN SCHEMA bi GRANT SELECT ON TABLES TO labflow_app_web;

GRANT USAGE ON SCHEMA app TO labflow_app_web;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO labflow_app_web;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
