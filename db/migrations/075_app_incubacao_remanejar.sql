-- 075 — app: o laudo de incubação remaneja os dias nas folhas ainda não impressas
--
-- Faixa do app (050–099). Pedido do Danyllo de 26/10: a descrição das amostras sai sempre em Times 10, numa fonte e num
-- tamanho só; o dia que não cabe nas suas linhas segue para o bloco seguinte e, se a folha acabar, o dia inteiro vai para
-- a próxima folha (nunca diminui a letra). Um dia que já tinha lugar pode crescer (amostra registrada depois), então o app
-- refaz os lugares das folhas que ninguém imprimiu. Folha impressa não muda: a trava abaixo recusa.
-- Desfazer: 075_app_incubacao_remanejar_desfazer.sql. Aplicar com o administrador do banco, depois de um backup.

BEGIN;

CREATE OR REPLACE FUNCTION app.incubacao_dias_folha_impressa() RETURNS trigger AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM app.paginas_laudo p WHERE p.id = OLD.pagina_id AND p.impresso_em IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM app.paginas_laudo p WHERE p.id = NEW.pagina_id AND p.impresso_em IS NOT NULL)) THEN
        RAISE EXCEPTION 'A folha já foi impressa: o lugar do dia % não muda.', OLD.dia;
    END IF;
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SET search_path = app, public, pg_temp;

CREATE TRIGGER incubacao_dias_so_folha_aberta BEFORE UPDATE OR DELETE ON app.incubacao_dias
    FOR EACH ROW EXECUTE FUNCTION app.incubacao_dias_folha_impressa();

GRANT UPDATE, DELETE ON app.incubacao_dias TO labflow_app_web;

COMMIT;
