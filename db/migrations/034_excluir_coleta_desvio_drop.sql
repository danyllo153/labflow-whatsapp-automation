-- 034 — excluir_coleta também recusa coleta com desvio de drop (pedido da sessão do app, revisão do #140, 22/10/2026)
--
-- Depende da 033. Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 034_excluir_coleta_desvio_drop.sql
--
-- desvios_drop referencia drops com ON DELETE CASCADE e não entra no JSON do arquivamento. Hoje o desvio só existe em drop
-- concluído (que a 033 já recusa), mas a checagem explícita evita depender disso: excluir não pode perder um desvio de drop.
-- Só troca a função (CREATE OR REPLACE): assinatura, permissões e o resto do comportamento são os da 033.

BEGIN;

CREATE OR REPLACE FUNCTION excluir_coleta(p_id bigint, p_quem bigint, p_motivo text DEFAULT NULL) RETURNS registros_excluidos AS $$
DECLARE
    v_col coletas;
    v_reg registros_excluidos;
BEGIN
    v_col := coleta_exigir_permissao(p_id, p_quem);
    IF EXISTS (SELECT 1 FROM analises WHERE coleta_id = p_id) THEN
        RAISE EXCEPTION 'A coleta já tem análises: exclua primeiro as análises, com motivo.';
    END IF;
    IF EXISTS (SELECT 1 FROM drops WHERE coleta_id = p_id AND status = 'Concluído') THEN
        RAISE EXCEPTION 'A coleta já tem drop concluído: não dá para excluir.';
    END IF;
    IF EXISTS (SELECT 1 FROM testes WHERE coleta_id = p_id) THEN
        RAISE EXCEPTION 'A coleta já tem TAB: não dá para excluir.';
    END IF;
    IF EXISTS (SELECT 1 FROM desvios_drop dd JOIN drops d ON d.id = dd.drop_id WHERE d.coleta_id = p_id) THEN
        RAISE EXCEPTION 'A coleta tem desvio de drop: não dá para excluir.';
    END IF;
    INSERT INTO registros_excluidos (tabela, registro_id, esquema, dados, motivo, excluido_por)
    VALUES ('coletas', p_id, 1,
            jsonb_build_object(
                'coleta', to_jsonb(v_col),
                'drops', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.dia) FROM drops d WHERE d.coleta_id = p_id), '[]'::jsonb),
                'arquivo', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM arquivo_amostras a WHERE a.coleta_id = p_id), '[]'::jsonb)),
            NULLIF(trim(COALESCE(p_motivo, '')), ''), p_quem)
    RETURNING * INTO v_reg;
    DELETE FROM coletas WHERE id = p_id;  -- os drops e o arquivo saem junto (ON DELETE CASCADE)
    INSERT INTO historico_alteracoes (tipo, tabela, registro_id, antes, depois, motivo, quem)
    VALUES ('excluido', 'coletas', p_id, to_jsonb(v_col), NULL, NULLIF(trim(COALESCE(p_motivo, '')), ''), p_quem);
    RETURN v_reg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION excluir_coleta(bigint, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION excluir_coleta(bigint, bigint, text) TO labflow_app;

COMMIT;
