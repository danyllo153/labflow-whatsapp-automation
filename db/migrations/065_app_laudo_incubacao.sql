-- 065 — app (web e celular): laudo Controle de Incubação e Leitura (LAB/001)
--
-- Faixa do app (050–099). Spec: rumo-do-app.md, "Laudos automáticos". Tarefa: APP-040. Depende da 060 (páginas e lotes
-- dos meios) e da 038 do bot (view bi.incubacao). Desfazer: 065_app_laudo_incubacao_desfazer.sql. Aplicar com o
-- administrador do banco, depois de um backup.
--
-- O laudo tem 7 blocos por folha, um por dia de incubação (4 linhas de descrição das amostras, os lotes dos meios
-- em uso e as datas de leitura). O conteúdo vem das análises do bot (bi.incubacao) e das águas do app, lido na hora
-- de gerar o PDF; aqui fica só QUAL folha e QUAL bloco cada dia ocupa, para a folha impressa não mudar de lugar.
-- Um dia com mais de 4 linhas de amostras ocupa mais de um bloco (`blocos`).

BEGIN;

ALTER TABLE app.paginas_laudo DROP CONSTRAINT paginas_laudo_laudo_check;
ALTER TABLE app.paginas_laudo ADD CONSTRAINT paginas_laudo_laudo_check CHECK (laudo IN (
    'material-asseptico', 'meios-OSA', 'meios-PDA', 'meios-PCA', 'meios-Wort',
    'agua-processo', 'superficies-Baia', 'superficies-Linha', 'fluxo-laminar', 'incubacao'
));

CREATE TABLE app.incubacao_dias (
    dia         date PRIMARY KEY,
    pagina_id   bigint NOT NULL REFERENCES app.paginas_laudo (id),
    bloco       smallint NOT NULL CHECK (bloco BETWEEN 0 AND 6),     -- o primeiro bloco da folha que o dia ocupa
    blocos      smallint NOT NULL CHECK (blocos BETWEEN 1 AND 7),
    incluido_em timestamptz NOT NULL DEFAULT now(),
    CHECK (bloco + blocos <= 7),
    UNIQUE (pagina_id, bloco)
);

GRANT SELECT, INSERT ON app.incubacao_dias TO labflow_app_web;   -- sem UPDATE nem DELETE: o lugar do dia não muda

COMMIT;
