-- Desfaz a 070_app_laudo_recebimento_fcoj.sql: apaga o lugar dos lotes e as páginas do laudo do recebimento. Backup antes.
-- O modelo enviado (app.modelos_documento, nome 'recebimento-fcoj') fica; apague à mão se quiser.

BEGIN;

DROP TABLE IF EXISTS app.recebimento_laudo;
DELETE FROM app.paginas_laudo WHERE laudo = 'recebimento-fcoj';
ALTER TABLE app.paginas_laudo DROP CONSTRAINT paginas_laudo_laudo_check;
ALTER TABLE app.paginas_laudo ADD CONSTRAINT paginas_laudo_laudo_check CHECK (laudo IN (
    'material-asseptico', 'meios-OSA', 'meios-PDA', 'meios-PCA', 'meios-Wort',
    'agua-processo', 'superficies-Baia', 'superficies-Linha', 'fluxo-laminar', 'incubacao'
));

COMMIT;
