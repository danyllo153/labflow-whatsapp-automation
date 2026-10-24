-- Desfaz a 060_app_meios_lotes.sql: apaga os lotes, o lote em uso e as páginas dos laudos novos (fica só o material
-- asséptico). Backup antes. Só desfaça depois de desfazer a 061, a 062 e a 063.

BEGIN;

DROP TABLE IF EXISTS app.uso_lote_meio;
DROP TABLE IF EXISTS app.lotes_meio;
DELETE FROM app.paginas_laudo WHERE laudo LIKE 'meios-%';
ALTER TABLE app.paginas_laudo DROP CONSTRAINT paginas_laudo_laudo_check;
ALTER TABLE app.paginas_laudo ADD CONSTRAINT paginas_laudo_laudo_check CHECK (laudo IN ('material-asseptico'));

COMMIT;
