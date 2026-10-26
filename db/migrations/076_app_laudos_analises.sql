-- 076 — app: laudos de TAB, Coliformes, Howard, NFC (tanques e navios), Embarque e da contra-amostra (embarque e recebimento)
--
-- Faixa do app (050–099). Spec: rumo-do-app.md, "Laudos automáticos"; 11-arquivo-contra-amostras.md. Pedido do Danyllo de
-- 26/10 (modelos em PDF enviados por ele; ficam no banco, nunca no Git). Desfazer: 076_app_laudos_analises_desfazer.sql.
-- Aplicar com o administrador do banco, depois de um backup.
--
-- Uma tabela só para o lugar das linhas destes laudos (como a 070 e a 073 fazem para o recebimento): cada linha (um teste,
-- uma coleta, uma amostra do embarque, um load arquivado) ganha uma folha e não muda mais. A "chave" separa as folhas: o
-- dia da análise no TAB, o tanque ou o navio no NFC, o navio no Embarque e a caixa na contra-amostra do embarque; folha
-- nunca mistura chaves. O conteúdo é lido das tabelas do bot na hora de gerar o PDF.

BEGIN;

ALTER TABLE app.paginas_laudo DROP CONSTRAINT paginas_laudo_laudo_check;
ALTER TABLE app.paginas_laudo ADD CONSTRAINT paginas_laudo_laudo_check CHECK (laudo IN (
    'material-asseptico', 'meios-OSA', 'meios-PDA', 'meios-PCA', 'meios-Wort',
    'agua-processo', 'superficies-Baia', 'superficies-Linha', 'fluxo-laminar', 'incubacao', 'recebimento-fcoj',
    'recebimento-nfc', 'tab', 'coliformes', 'howard', 'nfc-tanques', 'embarque-fcoj', 'contra-embarque', 'contra-recebimento'
));

CREATE TABLE app.laudo_linhas (
    laudo       text NOT NULL,
    ref         text NOT NULL CHECK (length(ref) BETWEEN 1 AND 60),     -- o que a linha mostra (id do teste, da coleta...)
    chave       text NOT NULL DEFAULT '' CHECK (length(chave) <= 80),    -- folhas não misturam chaves
    dia         date,                                                    -- para o "de/até" da folha
    pagina_id   bigint NOT NULL REFERENCES app.paginas_laudo (id),
    incluido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (laudo, ref)
);
CREATE INDEX laudo_linhas_pagina ON app.laudo_linhas (pagina_id);

GRANT SELECT, INSERT ON app.laudo_linhas TO labflow_app_web;   -- sem UPDATE nem DELETE: o lugar da linha não muda

COMMIT;
