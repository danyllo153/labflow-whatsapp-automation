-- 081 — app: ajustes pedidos pelo Danyllo em 27/10, depois de testar o app no ar (#337)
--
-- Faixa do app (050–099). Desfazer: 081_app_ajustes_do_teste_desfazer.sql. Aplicar com o administrador do banco, depois de
-- um backup.
--
-- - água do processo: desvio é a coleta com crescimento (C.T. ou B.L. com número maior que zero; "<1" não conta). Fica
--   aberto até alguém encerrar, com uma nota (quem e quando ficam guardados).
-- - compostas_testes: o que cada composta do EMBARQUE (navio) vai fazer, marcado pelo analista ao criar a composta ou
--   depois (TAB, Coliformes, Howard). É o que conta no "Para fazer" do TAB, do Coliformes e do Howard. O recebimento
--   segue a regra do banco (104): TAB em toda composta; Coliformes na primeira composta de cada load e em toda composta
--   da COL. Composta do embarque sem marca (as de antes): Coliformes pela 104 (toda composta), Howard sim, TAB não.
-- - apagar_coleta_excluida(registro, quem, motivo): o Admin apaga DE VEZ uma coleta que está na lixeira (registros_excluidos,
--   033). Só Admin, com motivo; o rastro (quem, quando, motivo e os dados da coleta) fica no historico_alteracoes. Como as
--   funções da 033: SECURITY DEFINER, dona labflow_app (o papel do app não grava nas tabelas do bot).
-- - atividades_fixas.opcional: a atividade que a pessoa faz no dia que escolher. Aparece no turno em qualquer dia (os dias
--   da semana não valem para ela) e, se não for feita, NÃO passa para o turno seguinte.

BEGIN;

ALTER TABLE app.coletas_agua_processo
    ADD COLUMN desvio_encerrado_em  timestamptz,
    ADD COLUMN desvio_encerrado_por bigint REFERENCES usuarios (id),
    ADD COLUMN desvio_nota          text CHECK (desvio_nota IS NULL OR length(trim(desvio_nota)) BETWEEN 1 AND 300),
    ADD CONSTRAINT coletas_agua_processo_desvio_encerrado CHECK ((desvio_encerrado_em IS NULL) = (desvio_encerrado_por IS NULL));

ALTER TABLE app.atividades_fixas ADD COLUMN opcional boolean NOT NULL DEFAULT false;

CREATE TABLE app.compostas_testes (
    composta_id bigint PRIMARY KEY REFERENCES compostas (id) ON DELETE CASCADE,
    tab         boolean NOT NULL DEFAULT false,
    coliformes  boolean NOT NULL DEFAULT true,
    howard      boolean NOT NULL DEFAULT false,
    marcado_por bigint REFERENCES usuarios (id),
    marcado_em  timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT, INSERT, UPDATE ON app.compostas_testes TO labflow_app_web;

CREATE FUNCTION apagar_coleta_excluida(p_registro bigint, p_quem bigint, p_motivo text) RETURNS jsonb AS $$
DECLARE
    v_dados jsonb;
    v_coleta bigint;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_quem AND cargo = 'Admin') THEN
        RAISE EXCEPTION 'Só o Admin apaga de vez uma coleta excluída.';
    END IF;
    IF length(trim(coalesce(p_motivo, ''))) < 5 THEN
        RAISE EXCEPTION 'Escreva o motivo para apagar de vez.';
    END IF;
    SELECT dados, registro_id INTO v_dados, v_coleta FROM registros_excluidos
    WHERE id = p_registro AND tabela = 'coletas' AND recuperado_em IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Essa coleta não está na lista das excluídas.';
    END IF;
    INSERT INTO historico_alteracoes (tipo, tabela, registro_id, antes, depois, motivo, quem)
    VALUES ('excluido', 'coletas', v_coleta, v_dados, NULL, 'Apagada de vez: ' || trim(p_motivo), p_quem);
    DELETE FROM registros_excluidos WHERE id = p_registro;
    RETURN jsonb_build_object('ok', true, 'coleta_id', v_coleta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION apagar_coleta_excluida(bigint, bigint, text) OWNER TO labflow_app;
-- no servidor a labflow_app já é dona dessas tabelas (não muda nada); no banco de teste, as migrations rodam com outro dono
GRANT SELECT, DELETE ON registros_excluidos TO labflow_app;
GRANT INSERT ON historico_alteracoes TO labflow_app;
GRANT SELECT ON usuarios TO labflow_app;
REVOKE ALL ON FUNCTION apagar_coleta_excluida(bigint, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apagar_coleta_excluida(bigint, bigint, text) TO labflow_app_web;

COMMIT;
