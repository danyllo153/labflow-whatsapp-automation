-- Desfaz a 058_app_laudo_esterilizacao.sql: tira o eficiente e o vínculo com as páginas e apaga as páginas e o modelo guardado.
-- Backup antes (apaga o PDF do modelo e o controle de quais páginas foram impressas).

BEGIN;

DROP INDEX IF EXISTS app.esterilizacoes_por_laudo;
ALTER TABLE app.esterilizacoes DROP COLUMN IF EXISTS laudo_id;
ALTER TABLE app.esterilizacoes DROP COLUMN IF EXISTS eficiente;
DROP TABLE IF EXISTS app.modelos_documento;
DROP TABLE IF EXISTS app.laudos_esterilizacao;

COMMIT;
