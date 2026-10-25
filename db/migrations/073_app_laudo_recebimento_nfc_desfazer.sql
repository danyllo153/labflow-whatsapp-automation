-- Desfaz a 073_app_laudo_recebimento_nfc.sql: apaga o lugar das linhas e as páginas do laudo do Recebimento NFC. Backup antes.

BEGIN;

DROP TABLE IF EXISTS app.recebimento_nfc_laudo;
DELETE FROM app.paginas_laudo WHERE laudo = 'recebimento-nfc';
ALTER TABLE app.paginas_laudo DROP CONSTRAINT paginas_laudo_laudo_check;
ALTER TABLE app.paginas_laudo ADD CONSTRAINT paginas_laudo_laudo_check CHECK (laudo IN (
    'material-asseptico', 'meios-OSA', 'meios-PDA', 'meios-PCA', 'meios-Wort',
    'agua-processo', 'superficies-Baia', 'superficies-Linha', 'fluxo-laminar', 'incubacao', 'recebimento-fcoj'
));

COMMIT;
