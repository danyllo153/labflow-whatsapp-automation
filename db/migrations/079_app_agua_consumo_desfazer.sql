-- Desfaz a 079 (água de consumo). Apaga as coletas, os pontos e os limites gravados pelo app: só com backup.

BEGIN;

DELETE FROM app.laudo_linhas WHERE laudo LIKE 'agua-consumo-%';
DELETE FROM app.paginas_laudo WHERE laudo LIKE 'agua-consumo-%';
DROP TABLE IF EXISTS app.resultados_agua_consumo;
DROP TABLE IF EXISTS app.coletas_agua_consumo;
DROP TABLE IF EXISTS app.pontos_agua_consumo;
DROP TABLE IF EXISTS app.limites_agua_consumo;

ALTER TABLE app.paginas_laudo DROP CONSTRAINT paginas_laudo_laudo_check;
ALTER TABLE app.paginas_laudo ADD CONSTRAINT paginas_laudo_laudo_check CHECK (laudo IN (
    'material-asseptico', 'meios-OSA', 'meios-PDA', 'meios-PCA', 'meios-Wort',
    'agua-processo', 'superficies-Baia', 'superficies-Linha', 'fluxo-laminar', 'incubacao', 'recebimento-fcoj',
    'recebimento-nfc', 'tab', 'coliformes', 'howard', 'nfc-tanques', 'embarque-fcoj', 'contra-embarque', 'contra-recebimento'
));

COMMIT;
