-- Desfaz a 065_app_laudo_incubacao.sql: apaga o lugar dos dias e as páginas do laudo de incubação. Backup antes.

BEGIN;

DROP TABLE IF EXISTS app.incubacao_dias;
DELETE FROM app.paginas_laudo WHERE laudo = 'incubacao';
ALTER TABLE app.paginas_laudo DROP CONSTRAINT paginas_laudo_laudo_check;
ALTER TABLE app.paginas_laudo ADD CONSTRAINT paginas_laudo_laudo_check CHECK (laudo IN (
    'material-asseptico', 'meios-OSA', 'meios-PDA', 'meios-PCA', 'meios-Wort',
    'agua-processo', 'superficies-Baia', 'superficies-Linha', 'fluxo-laminar'
));

COMMIT;
