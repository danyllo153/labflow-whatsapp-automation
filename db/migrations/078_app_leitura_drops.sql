-- 078 — app: a leitura do drop (5 dias depois de incubado), na aba Leituras
--
-- Faixa do app (050–099). Pedido do Danyllo de 27/10: o drop é ANÁLISE no dia dele (D5, D10, D15 depois da coleta: incuba
-- em stress) e LEITURA 5 dias depois (no dia do D10 lê o D5 e incuba o D10; no do D15 lê o D10; o D15 é lido 5 dias
-- depois e acabou). Até aqui o banco só sabia se o drop foi concluído (incubado) no dia. Esta tabela guarda a leitura:
-- "Todos negativos" de uma vez; o positivo pede um Confirmar e abre o desvio pela função que já existe
-- (abrir_desvio_drop), e a pessoa vai para Desvios registrar o que vai ser feito. Desfazer:
-- 078_app_leitura_drops_desfazer.sql. Aplicar com o administrador do banco, depois de um backup.

BEGIN;

CREATE TABLE app.leituras_drop (
    drop_id   bigint PRIMARY KEY REFERENCES drops (id),
    resultado text NOT NULL CHECK (resultado IN ('Negativo', 'Positivo')),
    lido_por  bigint NOT NULL REFERENCES usuarios (id),
    lido_em   timestamptz NOT NULL DEFAULT clock_timestamp()
);

GRANT SELECT, INSERT ON app.leituras_drop TO labflow_app_web;   -- sem UPDATE nem DELETE: a leitura não muda

COMMIT;
