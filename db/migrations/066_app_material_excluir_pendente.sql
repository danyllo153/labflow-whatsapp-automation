-- 066 — app (web e celular): material asséptico com dia excluído e resultado pendente
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md (v1.0), §7.2 Material asséptico. Tarefa: APP-053. Depende da 059.
-- Desfazer: 066_app_material_excluir_pendente_desfazer.sql. Aplicar com o administrador do banco, depois de um backup.
--
-- Pedido do Danyllo (24/10): poder excluir um dia lançado por engano e deixar o resultado (C.T. e B.L.) pendente para
-- lançar depois. Excluir ARQUIVA (quem, quando, motivo; nada se apaga) e o dia pode ser lançado de novo.

BEGIN;

ALTER TABLE app.material_asseptico ALTER COLUMN ct DROP NOT NULL, ALTER COLUMN ct DROP DEFAULT;   -- nulo = pendente
ALTER TABLE app.material_asseptico ALTER COLUMN bl DROP NOT NULL, ALTER COLUMN bl DROP DEFAULT;

ALTER TABLE app.material_asseptico
    ADD COLUMN excluido_por    bigint REFERENCES usuarios (id),
    ADD COLUMN excluido_em     timestamptz,
    ADD COLUMN motivo_exclusao text CHECK (motivo_exclusao IS NULL OR length(motivo_exclusao) <= 300),
    ADD CONSTRAINT material_asseptico_exclusao_completa CHECK ((excluido_em IS NULL) = (excluido_por IS NULL));

-- um dia valendo por vez; os excluídos ficam guardados ao lado
ALTER TABLE app.material_asseptico DROP CONSTRAINT material_asseptico_dia_key;
CREATE UNIQUE INDEX material_asseptico_um_por_dia ON app.material_asseptico (dia) WHERE excluido_em IS NULL;

COMMIT;
