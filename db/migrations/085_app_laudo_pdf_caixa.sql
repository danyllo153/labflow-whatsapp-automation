-- 085 — app: o PDF do laudo pronto da caixa de navio que veio da planilha (troca a 084)
--
-- Faixa do app (050–099). Desfazer: 085_app_laudo_pdf_caixa_desfazer.sql. Aplicar com o administrador do banco
-- (psql -U evolution), depois de um backup.
--
-- Pedido do Danyllo de 01/11: as caixas de navio da planilha (arquivo_navios.origem = 'carga', 105 do bot) não têm laudo
-- gerado pelo app. Admin e Analista sobem o PDF do laudo que já existe e a caixa fica com ele; o botão "Laudo" da caixa
-- abre esse PDF (as outras caixas abrem a folha do laudo de contra-amostra). Um PDF por caixa; subir outro troca (o antigo
-- fica no banco, com quem e quando). O PDF fica só no banco, nunca no Git.
--
-- A 084 (digitar o conteúdo da caixa) não era o pedido: a tabela dela sai aqui (só se estiver vazia).
-- carga_id é o arquivo_navios.id da caixa, sem chave estrangeira: num banco montado do zero a 085 roda antes da 105.

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM app.arquivo_conteudo_planilha) THEN
        RAISE EXCEPTION 'app.arquivo_conteudo_planilha tem linhas: confira antes de tirar a tabela da 084';
    END IF;
END $$;
DELETE FROM app.laudo_linhas WHERE laudo = 'contra-embarque' AND ref LIKE 'planilha:%';
DROP TABLE app.arquivo_conteudo_planilha;

CREATE TABLE app.arquivo_laudo_pdf (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    carga_id     bigint NOT NULL,                       -- arquivo_navios.id (origem 'carga')
    pdf          bytea NOT NULL CHECK (octet_length(pdf) BETWEEN 5 AND 10485760),  -- até 10 MB
    nome_arquivo text CHECK (nome_arquivo IS NULL OR length(nome_arquivo) BETWEEN 1 AND 200),
    enviado_por  bigint NOT NULL REFERENCES usuarios (id),
    enviado_em   timestamptz NOT NULL DEFAULT clock_timestamp(),
    trocado_em   timestamptz                            -- outro PDF tomou o lugar
);
CREATE UNIQUE INDEX arquivo_laudo_pdf_da_caixa ON app.arquivo_laudo_pdf (carga_id) WHERE trocado_em IS NULL;

GRANT SELECT, INSERT ON app.arquivo_laudo_pdf TO labflow_app_web;
GRANT UPDATE (trocado_em) ON app.arquivo_laudo_pdf TO labflow_app_web;

COMMIT;
