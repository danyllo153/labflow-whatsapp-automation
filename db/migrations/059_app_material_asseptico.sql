-- 059 — app (web e celular): Controle de Material Asséptico (o que foi usado em cada dia de análise) e o tipo
-- "Água de diluição" na esterilização
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md (v1.0), §7.2 Material asséptico. Tarefa: APP-041.
-- Desfazer: 059_app_material_asseptico_desfazer.sql. Depende da 054 e da 058. Aplicar com o administrador do banco,
-- depois de um backup. Nenhuma tabela do bot é alterada.
--
-- Um dia de análise por linha: os ciclos de esterilização de ponteira/pipeta, água de diluição e meio de cultura e os
-- lotes das placas de Petri (P pequenas, G grandes) usados no dia, em texto livre (o app sugere, o analista confirma ou
-- acrescenta), mais o C.T. e o B.L. do controle (normalmente <1). Quem preencheu fica guardado.
-- `app.paginas_laudo`: páginas dos laudos novos (este e os próximos), com pendente de imprimir / impressa.

BEGIN;

ALTER TABLE app.esterilizacoes DROP CONSTRAINT esterilizacoes_tipo_check;
ALTER TABLE app.esterilizacoes ADD CONSTRAINT esterilizacoes_tipo_check
    CHECK (tipo IN ('Ponteira', 'Meio', 'Frasco', 'Água de diluição', 'Descarte', 'Outro'));

CREATE TABLE app.paginas_laudo (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    laudo        text NOT NULL CHECK (laudo IN ('material-asseptico')),
    criado_em    timestamptz NOT NULL DEFAULT now(),
    impresso_por bigint REFERENCES usuarios (id),
    impresso_em  timestamptz,
    CHECK ((impresso_em IS NULL) = (impresso_por IS NULL))
);

CREATE TABLE app.material_asseptico (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dia            date NOT NULL UNIQUE,                      -- data da análise (America/Sao_Paulo)
    ponteiras      text CHECK (ponteiras IS NULL OR length(ponteiras) <= 200),   -- ciclos, ex.: "A954, A959"
    agua_diluicao  text CHECK (agua_diluicao IS NULL OR length(agua_diluicao) <= 200),
    placas         text CHECK (placas IS NULL OR length(placas) <= 200),         -- lotes livres, ex.: "P26073, G9093"
    meios          text CHECK (meios IS NULL OR length(meios) <= 200),
    ct             text NOT NULL DEFAULT '<1' CHECK (length(trim(ct)) BETWEEN 1 AND 10),
    bl             text NOT NULL DEFAULT '<1' CHECK (length(trim(bl)) BETWEEN 1 AND 10),
    preenchido_por bigint NOT NULL REFERENCES usuarios (id),  -- o responsável pelo preenchimento (o último que gravou)
    preenchido_em  timestamptz NOT NULL DEFAULT now(),
    pagina_id      bigint NOT NULL REFERENCES app.paginas_laudo (id)
);

GRANT SELECT, INSERT, UPDATE ON app.paginas_laudo TO labflow_app_web;
GRANT SELECT, INSERT, UPDATE ON app.material_asseptico TO labflow_app_web;   -- sem DELETE
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO labflow_app_web;

COMMIT;
