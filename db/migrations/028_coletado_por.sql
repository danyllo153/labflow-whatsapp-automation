-- 028 — "coletado por": quem coletou o tanque quando não foi quem registrou
--
-- Depende da 002 (coletas) e da 013 (bi.coletas). Aplicar com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 028_coletado_por.sql
--
-- No piloto, o pessoal da micro e da física coleta, mas quem registra no bot é o laboratório.
-- "tanque 42 coletado por Joyce" grava o nome de quem coletou em coletas.coletado_por; sem "coletado por"
-- o responsável é quem mandou a mensagem (registrado_por, como sempre). registrado_por continua guardando
-- QUEM DIGITOU (trilha de auditoria); as telas e consultas mostram COALESCE(coletado_por, nome do usuário).

BEGIN;

ALTER TABLE coletas ADD COLUMN IF NOT EXISTS coletado_por text
    CHECK (coletado_por IS NULL OR (length(trim(coletado_por)) BETWEEN 1 AND 40));

-- Painel (Power BI): "registrado_por" passa a ser quem coletou (nome dito ou quem registrou); a coluna nova
-- digitado_por traz quem digitou. CREATE OR REPLACE mantém o nome e o tipo das colunas antigas e acrescenta no fim.
CREATE OR REPLACE VIEW bi.coletas AS
SELECT c.id AS coleta_id,
       CASE c.origem WHEN 'terra' THEN 'Terra' ELSE 'Navio' END AS origem,
       c.tanque,
       trim(n.nome || ' ' || n.viagem) AS navio,
       c.data_coleta,
       COALESCE(c.coletado_por, u.nome) AS registrado_por,
       c.registrado_em,
       u.nome AS digitado_por
FROM coletas c
LEFT JOIN navios n ON n.id = c.navio_id
LEFT JOIN usuarios u ON u.id = c.registrado_por;

COMMIT;