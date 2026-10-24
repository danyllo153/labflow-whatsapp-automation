-- 070 — app (web e celular): laudo do Recebimento FCOJ, preenchido sozinho com os loads registrados
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md §5.2; rumo-do-app.md, "Laudos automáticos". Tarefa: APP-059. Depende da 060
-- (páginas dos laudos) e das tabelas do recebimento do bot. Desfazer: 070_app_laudo_recebimento_fcoj_desfazer.sql.
-- Aplicar com o administrador do banco, depois de um backup.
--
-- Uma linha por load. O conteúdo (lotes, fábrica e os resultados de C.T e B.L) vem das tabelas do bot e é lido na hora de
-- gerar o PDF; aqui fica só QUAL folha cada load ocupa, para a folha impressa não mudar de lugar. O modelo oficial é
-- enviado pelo Admin na aba Laudo (app.modelos_documento, nome 'recebimento-fcoj'), nunca vai para o Git.

BEGIN;

ALTER TABLE app.paginas_laudo DROP CONSTRAINT paginas_laudo_laudo_check;
ALTER TABLE app.paginas_laudo ADD CONSTRAINT paginas_laudo_laudo_check CHECK (laudo IN (
    'material-asseptico', 'meios-OSA', 'meios-PDA', 'meios-PCA', 'meios-Wort',
    'agua-processo', 'superficies-Baia', 'superficies-Linha', 'fluxo-laminar', 'incubacao', 'recebimento-fcoj'
));

CREATE TABLE app.recebimento_laudo (
    load_id     bigint PRIMARY KEY REFERENCES loads (id) ON DELETE CASCADE,
    pagina_id   bigint NOT NULL REFERENCES app.paginas_laudo (id),
    incluido_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recebimento_laudo_pagina ON app.recebimento_laudo (pagina_id);

GRANT SELECT, INSERT ON app.recebimento_laudo TO labflow_app_web;   -- sem UPDATE nem DELETE: o lugar do load não muda

COMMIT;
