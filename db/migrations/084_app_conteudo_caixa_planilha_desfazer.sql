-- Desfaz a 084: apaga o conteúdo digitado das caixas da planilha e as linhas dele no laudo de contra-amostra (só com backup;
-- tire antes o botão "Adicionar laudo" do app).

BEGIN;

DELETE FROM app.laudo_linhas WHERE laudo = 'contra-embarque' AND ref LIKE 'planilha:%';
DROP TABLE IF EXISTS app.arquivo_conteudo_planilha;

COMMIT;
