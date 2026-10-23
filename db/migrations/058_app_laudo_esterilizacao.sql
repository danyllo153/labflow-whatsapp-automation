-- 058 — app (web e celular): laudo "Controle de Ciclos de Esterilização" (páginas, eficiente Sim/Não e o modelo em PDF)
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md (v1.0), §7 Esterilização (laudo). Tarefa: APP-035.
-- Desfazer: 058_app_laudo_esterilizacao_desfazer.sql. Depende da 054 (esterilizações). Aplicar com o administrador do banco, depois de um backup.
-- Nenhuma tabela do bot é alterada.
--
-- `eficiente`: Sim por padrão (quase sempre é); o analista troca para Não ao olhar a fita e a nota da autoclave.
-- `app.laudos_esterilizacao`: uma página do laudo (35 linhas; uma linha = um ciclo num dia). Cada esterilização aponta
-- para a página em que está; a página cheia fica "pendente de imprimir" até alguém marcar como impressa.
-- `app.modelos_documento`: o PDF oficial da empresa (confidencial) fica aqui, enviado pelo Admin, nunca no Git.

BEGIN;

CREATE TABLE app.laudos_esterilizacao (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    criado_em    timestamptz NOT NULL DEFAULT now(),
    impresso_por bigint REFERENCES usuarios (id),
    impresso_em  timestamptz,
    CHECK ((impresso_em IS NULL) = (impresso_por IS NULL))
);

CREATE TABLE app.modelos_documento (
    nome        text PRIMARY KEY CHECK (length(trim(nome)) BETWEEN 1 AND 60),
    pdf         bytea NOT NULL CHECK (length(pdf) BETWEEN 1 AND 5000000),
    enviado_por bigint NOT NULL REFERENCES usuarios (id),
    enviado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.esterilizacoes ADD COLUMN eficiente boolean NOT NULL DEFAULT true;
ALTER TABLE app.esterilizacoes ADD COLUMN laudo_id bigint REFERENCES app.laudos_esterilizacao (id);
CREATE INDEX esterilizacoes_por_laudo ON app.esterilizacoes (laudo_id) WHERE excluida_em IS NULL;

-- O que já foi registrado entra nas páginas, 35 linhas por página, na ordem em que foi feito.
WITH linhas AS (
    SELECT dia, lower(trim(ciclo)) AS ciclo, min(feita_em) AS primeira
    FROM app.esterilizacoes WHERE excluida_em IS NULL GROUP BY dia, lower(trim(ciclo))
), numeradas AS (
    SELECT dia, ciclo, (row_number() OVER (ORDER BY primeira, dia, ciclo) - 1) / 35 AS pagina FROM linhas
), paginas AS (
    SELECT DISTINCT pagina FROM numeradas
), criadas AS (
    INSERT INTO app.laudos_esterilizacao (criado_em)
    SELECT now() FROM paginas ORDER BY pagina
    RETURNING id
), ordem AS (
    SELECT id, row_number() OVER (ORDER BY id) - 1 AS pagina FROM criadas
)
UPDATE app.esterilizacoes e SET laudo_id = o.id
FROM numeradas n JOIN ordem o ON o.pagina = n.pagina
WHERE e.excluida_em IS NULL AND e.dia = n.dia AND lower(trim(e.ciclo)) = n.ciclo;

GRANT SELECT, INSERT, UPDATE ON app.laudos_esterilizacao TO labflow_app_web;
GRANT SELECT, INSERT, UPDATE ON app.modelos_documento TO labflow_app_web;   -- sem DELETE: nada se apaga de verdade
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
