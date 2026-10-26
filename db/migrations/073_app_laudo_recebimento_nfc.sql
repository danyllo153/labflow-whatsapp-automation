-- 073 — app (web e celular): laudo do Recebimento NFC, no mesmo modelo do laudo do Recebimento FCOJ
--
-- Faixa do app (050–099). Spec: rumo-do-app.md, "Laudos automáticos" (Recebimento NFC: o mesmo modelo do FCOJ, decidido
-- pelo Danyllo em 25/10; o que muda é o item 129). Depende da 070. Desfazer: 073_app_laudo_recebimento_nfc_desfazer.sql.
-- Aplicar com o administrador do banco, depois de um backup.
--
-- Uma linha por lote e tipo (fresh/past) do recebimento_nfc do bot, 15 por folha, folhas próprias (sem misturar com o
-- FCOJ). Como na 070, aqui fica só QUAL folha cada linha ocupa; o resto é lido das tabelas do bot ao gerar o PDF. O modelo
-- é o mesmo do FCOJ (app.modelos_documento, nome 'recebimento-fcoj').

BEGIN;

ALTER TABLE app.paginas_laudo DROP CONSTRAINT paginas_laudo_laudo_check;
ALTER TABLE app.paginas_laudo ADD CONSTRAINT paginas_laudo_laudo_check CHECK (laudo IN (
    'material-asseptico', 'meios-OSA', 'meios-PDA', 'meios-PCA', 'meios-Wort',
    'agua-processo', 'superficies-Baia', 'superficies-Linha', 'fluxo-laminar', 'incubacao', 'recebimento-fcoj',
    'recebimento-nfc'
));

CREATE TABLE app.recebimento_nfc_laudo (
    recebimento_nfc_id bigint PRIMARY KEY REFERENCES recebimento_nfc (id) ON DELETE CASCADE,
    pagina_id   bigint NOT NULL REFERENCES app.paginas_laudo (id),
    incluido_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recebimento_nfc_laudo_pagina ON app.recebimento_nfc_laudo (pagina_id);

GRANT SELECT, INSERT ON app.recebimento_nfc_laudo TO labflow_app_web;   -- sem UPDATE nem DELETE: o lugar da linha não muda

COMMIT;
