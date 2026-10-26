-- Desfaz a 076_app_laudos_analises.sql: apaga o lugar das linhas e as páginas destes laudos. Backup antes.

BEGIN;

DROP TABLE IF EXISTS app.laudo_linhas;
DELETE FROM app.paginas_laudo
WHERE laudo IN ('tab', 'coliformes', 'howard', 'nfc-tanques', 'embarque-fcoj', 'contra-embarque', 'contra-recebimento');
ALTER TABLE app.paginas_laudo DROP CONSTRAINT paginas_laudo_laudo_check;
ALTER TABLE app.paginas_laudo ADD CONSTRAINT paginas_laudo_laudo_check CHECK (laudo IN (
    'material-asseptico', 'meios-OSA', 'meios-PDA', 'meios-PCA', 'meios-Wort',
    'agua-processo', 'superficies-Baia', 'superficies-Linha', 'fluxo-laminar', 'incubacao', 'recebimento-fcoj',
    'recebimento-nfc'
));

COMMIT;
