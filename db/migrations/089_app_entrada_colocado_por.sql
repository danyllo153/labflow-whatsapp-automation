-- 089 - app: quem colocou a pessoa no turno (ressalva da revisao de seguranca da onda 1)
--
-- "Colocar no turno" (A3) cria a entrada de OUTRA pessoa, mas nao guardava quem clicou. Agora a entrada guarda em
-- colocado_por o usuarios.id de quem estava logado. NULL = a propria pessoa entrou no turno (ou registro antigo,
-- de antes desta migration). Nenhum dado existente muda.
-- O GRANT da 052 e por tabela (SELECT, INSERT, UPDATE, DELETE em app.entradas_turno), entao a coluna nova ja vale
-- para labflow_app_web; o GRANT abaixo repete isso de forma explicita e nao da nada a mais (sem TRUNCATE).
-- Desfazer: 089_app_entrada_colocado_por_desfazer.sql. Aplicar com o usuario dono do banco (lfadmin na Lite).

BEGIN;

ALTER TABLE app.entradas_turno
    ADD COLUMN IF NOT EXISTS colocado_por bigint REFERENCES usuarios (id);

GRANT SELECT, INSERT, UPDATE, DELETE ON app.entradas_turno TO labflow_app_web;

COMMIT;
