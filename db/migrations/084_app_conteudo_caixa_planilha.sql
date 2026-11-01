-- 084 — app: o que tem nas caixas de navio que vieram da planilha (carga inicial), para o laudo de contra-amostra
--
-- Faixa do app (050–099). Desfazer: 084_app_conteudo_caixa_planilha_desfazer.sql. Aplicar com o administrador do banco
-- (psql -U evolution), depois de um backup.
--
-- Pedido do Danyllo de 01/11 (rumo-do-app.md, recados do bot): as caixas de navio da planilha (arquivo_navios.origem =
-- 'carga', 105 do bot) só têm a linha "carga inicial", sem dizer o que está nelas. Admin e Analista digitam o conteúdo
-- (FCOJ: os loads e a quantidade; NFC: o tanque do pote) e ele sai no laudo de contra-amostra do embarque, na folha da
-- caixa. O vencimento continua o da planilha (arquivo_navios.descarte_carga): esta tabela não muda data nenhuma.
--
-- carga_id é o arquivo_navios.id da caixa, sem chave estrangeira: num banco montado do zero a 084 roda antes da 105
-- (ordem dos números). A linha não se apaga: "apagada_em" tira do laudo (o lugar da linha na folha, 076, não muda).

BEGIN;

CREATE TABLE app.arquivo_conteudo_planilha (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    carga_id    bigint NOT NULL,                                -- arquivo_navios.id (origem 'carga')
    tipo        text NOT NULL CHECK (tipo IN ('fcoj', 'pote')),
    loads       text CHECK (loads IS NULL OR loads ~ '^[0-9]{1,10}(/[0-9]{1,10}){0,19}$'),  -- "43783/43784"
    tanque      text CHECK (tanque IS NULL OR tanque ~ '^[0-9]{1,2}[A-Z]{0,2}$'),            -- "2P", "1C"
    quantidade  integer NOT NULL CHECK (quantidade BETWEEN 1 AND 99),
    criada_por  bigint NOT NULL REFERENCES usuarios (id),
    criada_em   timestamptz NOT NULL DEFAULT clock_timestamp(),
    apagada_em  timestamptz,
    apagada_por bigint REFERENCES usuarios (id),
    CHECK ((tipo = 'fcoj') = (loads IS NOT NULL)),
    CHECK ((tipo = 'pote') = (tanque IS NOT NULL)),
    CHECK ((apagada_em IS NULL) = (apagada_por IS NULL))
);
CREATE INDEX arquivo_conteudo_planilha_carga ON app.arquivo_conteudo_planilha (carga_id) WHERE apagada_em IS NULL;

GRANT SELECT, INSERT ON app.arquivo_conteudo_planilha TO labflow_app_web;
GRANT UPDATE (apagada_em, apagada_por) ON app.arquivo_conteudo_planilha TO labflow_app_web;

COMMIT;
