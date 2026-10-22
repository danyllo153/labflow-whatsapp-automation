-- 033 — corrigir, excluir e recuperar COLETA por funções do banco (pedido PB4 da sessão do app, parte 1: Coletas)
--
-- Depende da 001 (coletas, drops, arquivo_amostras) e da 029 (cargo Coletor). Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 033_coletas_corrigir_excluir.sql
--
-- A regra mora num lugar só e serve ao app (botões Editar e Excluir) e, depois, ao bot ("corrigir coleta", "apagar coleta"):
--   corrigir_coleta(id, campos, quem)              -> muda tanque, data da coleta, navio (só coleta de navio) e coletado_por;
--   excluir_coleta(id, quem, motivo)               -> ARQUIVA: guarda o registro inteiro em registros_excluidos e o tira da tabela viva;
--   recuperar_coleta(registro_excluido_id, motivo, quem) -> Admin: reinsere com os MESMOS ids (coleta, drops, arquivo).
--
-- Decisões do Danyllo (22/10/2026): excluir = arquivar (nada muda nas views bi.* nem nas consultas do bot, e o UNIQUE de coletas
-- continua valendo); coleta com análise, drop concluído ou TAB: exclusão RECUSADA (primeiro se resolve o que está ligado a ela).
-- Motivo: coleta não pede (corrigir e excluir); recuperar pede (Admin). Tudo vai para historico_alteracoes.
--
-- Quem pode (conferido AQUI, por p_quem, nunca só no app ou no bot):
--   * Admin e Operador: qualquer coleta; Consultor e desconhecidos: ninguém;
--   * Coletor: só a coleta que ele mesmo registrou E só enquanto ela não tem análise, drop concluído nem TAB (mesma regra da 029);
--   * recuperar: só Admin.
-- Corrigir: a origem (terra/navio) NÃO muda (exclua e registre de novo). Mudar a DATA: recusado se há drop concluído, análise ou TAB;
-- nos drops pendentes a data prevista é recalculada (data + 5, 10, 15) e a data de descarte do arquivo (data + 365).
-- Tanque ou data que bata com outra coleta: recusado, em português (o UNIQUE de coletas continua sendo a defesa final).
--
-- registros_excluidos.esquema = versão do formato do JSON em "dados" (hoje 1): permite recuperar certo se as tabelas mudarem.
-- Pedido do app (22/10/2026): recuperar reinsere com os mesmos ids (OVERRIDING SYSTEM VALUE), para o histórico e as tabelas do app
-- continuarem apontando para o registro certo; se já existir outra coleta igual, recusa com mensagem clara.
--
-- Funções SECURITY DEFINER com search_path fixo e dono labflow_app, como na 031 (o papel do app não grava nas tabelas do bot).
-- O GRANT EXECUTE para o papel do app fica numa migration do app (o SELECT na view já vem do privilégio padrão da 050).

BEGIN;

CREATE TABLE IF NOT EXISTS registros_excluidos (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tabela              text        NOT NULL,
    registro_id         bigint      NOT NULL,
    esquema             smallint    NOT NULL DEFAULT 1,
    dados               jsonb       NOT NULL,
    motivo              text,
    excluido_por        bigint      REFERENCES usuarios (id),
    excluido_em         timestamptz NOT NULL DEFAULT now(),
    recuperado_por      bigint      REFERENCES usuarios (id),
    recuperado_em       timestamptz,
    motivo_recuperacao  text,
    CONSTRAINT registros_excluidos_recuperado_check CHECK ((recuperado_em IS NULL) = (recuperado_por IS NULL))
);
-- um registro só pode estar excluído uma vez de cada vez (depois de recuperado, pode ser excluído de novo)
CREATE UNIQUE INDEX IF NOT EXISTS registros_excluidos_ativo ON registros_excluidos (tabela, registro_id) WHERE recuperado_em IS NULL;

CREATE TABLE IF NOT EXISTS historico_alteracoes (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo         text        NOT NULL CHECK (tipo IN ('corrigido', 'excluido', 'recuperado')),
    tabela       text        NOT NULL,
    registro_id  bigint      NOT NULL,
    antes        jsonb,
    depois       jsonb,
    motivo       text,
    quem         bigint      REFERENCES usuarios (id),
    quando       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS historico_alteracoes_registro ON historico_alteracoes (tabela, registro_id, quando DESC);

-- o que o app lê na aba Histórico (SELECT para o papel do app vem do privilégio padrão da 050)
CREATE OR REPLACE VIEW vw_historico_alteracoes AS
SELECT h.id, h.tipo, h.tabela, h.registro_id, h.antes, h.depois, h.motivo,
       h.quem AS quem_id, u.nome AS quem_nome, h.quando
FROM historico_alteracoes h
LEFT JOIN usuarios u ON u.id = h.quem;

-- Confere quem é a pessoa e se pode mexer nesta coleta; devolve a coleta travada (FOR UPDATE).
CREATE OR REPLACE FUNCTION coleta_exigir_permissao(p_id bigint, p_quem bigint) RETURNS coletas AS $$
DECLARE
    v_cargo text;
    v       coletas;
BEGIN
    SELECT cargo INTO v_cargo FROM usuarios WHERE id = p_quem;
    IF v_cargo IS NULL THEN
        RAISE EXCEPTION 'Pessoa não encontrada.';
    END IF;
    IF v_cargo NOT IN ('Admin', 'Operador', 'Coletor') THEN
        RAISE EXCEPTION 'Seu cargo não pode corrigir ou excluir coletas.';
    END IF;
    SELECT * INTO v FROM coletas WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Coleta não encontrada.';
    END IF;
    IF v_cargo = 'Coletor' THEN
        IF v.registrado_por IS DISTINCT FROM p_quem THEN
            RAISE EXCEPTION 'O Coletor só corrige ou exclui a coleta que ele mesmo registrou.';
        END IF;
        IF EXISTS (SELECT 1 FROM analises WHERE coleta_id = p_id)
           OR EXISTS (SELECT 1 FROM drops WHERE coleta_id = p_id AND status = 'Concluído')
           OR EXISTS (SELECT 1 FROM testes WHERE coleta_id = p_id) THEN
            RAISE EXCEPTION 'Essa coleta já tem análise, drop concluído ou TAB: peça a um Operador ou Admin.';
        END IF;
    END IF;
    RETURN v;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION corrigir_coleta(p_id bigint, p_campos jsonb, p_quem bigint) RETURNS coletas AS $$
DECLARE
    v_antes   coletas;
    v         coletas;
    v_chave   text;
    v_tanque  text;
    v_data    date;
    v_navio   bigint;
    v_coletou text;
    v_ant     jsonb := '{}'::jsonb;
    v_dep     jsonb := '{}'::jsonb;
BEGIN
    v_antes := coleta_exigir_permissao(p_id, p_quem);
    IF p_campos IS NULL OR jsonb_typeof(p_campos) <> 'object' OR p_campos = '{}'::jsonb THEN
        RAISE EXCEPTION 'Diga o que corrigir: tanque, data_coleta, navio_id ou coletado_por.';
    END IF;
    FOR v_chave IN SELECT jsonb_object_keys(p_campos) LOOP
        IF v_chave = 'origem' THEN
            RAISE EXCEPTION 'A origem da coleta (terra ou navio) não muda: exclua a coleta e registre de novo.';
        ELSIF v_chave NOT IN ('tanque', 'data_coleta', 'navio_id', 'coletado_por') THEN
            RAISE EXCEPTION 'Esse campo não pode ser corrigido: %.', v_chave;
        END IF;
    END LOOP;

    v_tanque  := v_antes.tanque;
    v_data    := v_antes.data_coleta;
    v_navio   := v_antes.navio_id;
    v_coletou := v_antes.coletado_por;

    IF p_campos ? 'tanque' THEN
        v_tanque := upper(trim(COALESCE(p_campos ->> 'tanque', '')));
        IF v_tanque = '' THEN
            RAISE EXCEPTION 'O tanque não pode ficar vazio.';
        END IF;
    END IF;
    IF p_campos ? 'navio_id' THEN
        IF v_antes.origem <> 'navio' THEN
            RAISE EXCEPTION 'Só coleta de navio tem navio.';
        END IF;
        v_navio := (p_campos ->> 'navio_id')::bigint;
        IF v_navio IS NULL OR NOT EXISTS (SELECT 1 FROM navios WHERE id = v_navio) THEN
            RAISE EXCEPTION 'Navio não encontrado.';
        END IF;
    END IF;
    IF p_campos ? 'coletado_por' THEN
        v_coletou := NULLIF(trim(COALESCE(p_campos ->> 'coletado_por', '')), '');
        IF v_coletou IS NOT NULL AND length(v_coletou) > 40 THEN
            RAISE EXCEPTION 'O nome de quem coletou é muito longo (máximo 40 letras).';
        END IF;
    END IF;
    IF p_campos ? 'data_coleta' THEN
        v_data := (p_campos ->> 'data_coleta')::date;
        IF v_data IS NULL THEN
            RAISE EXCEPTION 'Data da coleta inválida.';
        END IF;
        IF v_data <> v_antes.data_coleta THEN
            IF EXISTS (SELECT 1 FROM drops WHERE coleta_id = p_id AND status = 'Concluído') THEN
                RAISE EXCEPTION 'A coleta já tem drop concluído: a data não pode mudar.';
            END IF;
            IF EXISTS (SELECT 1 FROM analises WHERE coleta_id = p_id) OR EXISTS (SELECT 1 FROM testes WHERE coleta_id = p_id) THEN
                RAISE EXCEPTION 'A coleta já tem análise ou TAB: a data não pode mudar.';
            END IF;
        END IF;
    END IF;

    IF v_tanque = v_antes.tanque AND v_data = v_antes.data_coleta AND v_navio IS NOT DISTINCT FROM v_antes.navio_id
       AND v_coletou IS NOT DISTINCT FROM v_antes.coletado_por THEN
        RAISE EXCEPTION 'Nada mudou: os valores novos são iguais aos atuais.';
    END IF;
    IF EXISTS (SELECT 1 FROM coletas k WHERE k.id <> p_id AND k.origem = v_antes.origem AND k.navio_id IS NOT DISTINCT FROM v_navio
                  AND k.tanque = v_tanque AND k.data_coleta = v_data) THEN
        RAISE EXCEPTION 'Já existe uma coleta desse tanque nessa data.';
    END IF;

    UPDATE coletas SET tanque = v_tanque, data_coleta = v_data, navio_id = v_navio, coletado_por = v_coletou
    WHERE id = p_id RETURNING * INTO v;

    IF v_data <> v_antes.data_coleta THEN
        UPDATE drops SET data_prevista = v_data + dia WHERE coleta_id = p_id AND status = 'Pendente';
        UPDATE arquivo_amostras SET data_descarte = v_data + 365 WHERE coleta_id = p_id AND status = 'Arquivado';
    END IF;

    IF v_tanque <> v_antes.tanque THEN v_ant := v_ant || jsonb_build_object('tanque', v_antes.tanque); v_dep := v_dep || jsonb_build_object('tanque', v.tanque); END IF;
    IF v_data <> v_antes.data_coleta THEN v_ant := v_ant || jsonb_build_object('data_coleta', v_antes.data_coleta); v_dep := v_dep || jsonb_build_object('data_coleta', v.data_coleta); END IF;
    IF v_navio IS DISTINCT FROM v_antes.navio_id THEN v_ant := v_ant || jsonb_build_object('navio_id', v_antes.navio_id); v_dep := v_dep || jsonb_build_object('navio_id', v.navio_id); END IF;
    IF v_coletou IS DISTINCT FROM v_antes.coletado_por THEN v_ant := v_ant || jsonb_build_object('coletado_por', v_antes.coletado_por); v_dep := v_dep || jsonb_build_object('coletado_por', v.coletado_por); END IF;
    INSERT INTO historico_alteracoes (tipo, tabela, registro_id, antes, depois, quem)
    VALUES ('corrigido', 'coletas', p_id, v_ant, v_dep, p_quem);
    RETURN v;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe uma coleta desse tanque nessa data.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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

CREATE OR REPLACE FUNCTION recuperar_coleta(p_excluido_id bigint, p_motivo text, p_quem bigint) RETURNS coletas AS $$
DECLARE
    v_reg registros_excluidos;
    v_col coletas;
    v     coletas;
BEGIN
    IF p_quem IS NULL OR NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_quem AND cargo = 'Admin') THEN
        RAISE EXCEPTION 'Só administradores podem recuperar uma coleta excluída.';
    END IF;
    IF NULLIF(trim(COALESCE(p_motivo, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Para recuperar, escreva o motivo.';
    END IF;
    SELECT * INTO v_reg FROM registros_excluidos WHERE id = p_excluido_id AND tabela = 'coletas' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registro excluído não encontrado.';
    END IF;
    IF v_reg.recuperado_em IS NOT NULL THEN
        RAISE EXCEPTION 'Essa coleta já foi recuperada.';
    END IF;
    IF v_reg.esquema <> 1 THEN
        RAISE EXCEPTION 'Formato do registro excluído (esquema %) não é conhecido por esta função.', v_reg.esquema;
    END IF;
    v_col := jsonb_populate_record(NULL::coletas, v_reg.dados -> 'coleta');
    IF EXISTS (SELECT 1 FROM coletas k WHERE k.origem = v_col.origem AND k.navio_id IS NOT DISTINCT FROM v_col.navio_id
                  AND k.tanque = v_col.tanque AND k.data_coleta = v_col.data_coleta) THEN
        RAISE EXCEPTION 'Já existe outra coleta igual (mesmo tanque, data e origem): não dá para recuperar esta.';
    END IF;
    IF EXISTS (SELECT 1 FROM coletas WHERE id = v_col.id) THEN
        RAISE EXCEPTION 'O número dessa coleta já está em uso: não dá para recuperar.';
    END IF;
    INSERT INTO coletas OVERRIDING SYSTEM VALUE SELECT (jsonb_populate_record(NULL::coletas, v_reg.dados -> 'coleta')).* RETURNING * INTO v;
    INSERT INTO drops OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(NULL::drops, v_reg.dados -> 'drops');
    INSERT INTO arquivo_amostras OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(NULL::arquivo_amostras, v_reg.dados -> 'arquivo');
    UPDATE registros_excluidos SET recuperado_em = now(), recuperado_por = p_quem, motivo_recuperacao = trim(p_motivo) WHERE id = v_reg.id;
    INSERT INTO historico_alteracoes (tipo, tabela, registro_id, antes, depois, motivo, quem)
    VALUES ('recuperado', 'coletas', v.id, NULL, to_jsonb(v), trim(p_motivo), p_quem);
    RETURN v;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe outra coleta igual: não dá para recuperar esta.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION coleta_exigir_permissao(bigint, bigint), corrigir_coleta(bigint, jsonb, bigint),
    excluir_coleta(bigint, bigint, text), recuperar_coleta(bigint, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION coleta_exigir_permissao(bigint, bigint), corrigir_coleta(bigint, jsonb, bigint),
    excluir_coleta(bigint, bigint, text), recuperar_coleta(bigint, text, bigint) TO labflow_app;

COMMIT;
