-- Desfaz a 059_app_material_asseptico.sql: apaga o material asséptico e as páginas dos laudos novos e volta a lista de
-- tipos da esterilização. Backup antes. Se já houver esterilização do tipo "Água de diluição", o desfazer para (troque
-- antes para "Outro" com a descrição).

BEGIN;

DROP TABLE IF EXISTS app.material_asseptico;
DROP TABLE IF EXISTS app.paginas_laudo;
ALTER TABLE app.esterilizacoes DROP CONSTRAINT esterilizacoes_tipo_check;
ALTER TABLE app.esterilizacoes ADD CONSTRAINT esterilizacoes_tipo_check
    CHECK (tipo IN ('Ponteira', 'Meio', 'Frasco', 'Descarte', 'Outro'));

COMMIT;
