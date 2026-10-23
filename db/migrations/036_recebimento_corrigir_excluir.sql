-- 036 — corrigir, excluir e recuperar RECEBIMENTO por funções do banco (pedido PB4 da sessão do app, parte 2: Recebimento)
--
-- Depende da 033 (registros_excluidos, historico_alteracoes) e da 035 (cargo Analista). Aplicar, como labflow_app, com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 036_recebimento_corrigir_excluir.sql
-- Desfazer: 036_recebimento_corrigir_excluir_desfazer.sql.
--
-- Mesmo desenho da 033 (coletas), para o app (botões Editar e Excluir da página Recebimento) e, depois, o bot:
--   corrigir_recebimento(lote_id, campos, quem, motivo) -> muda o número do lote e a data do recebimento;
--   corrigir_load(load_id, campos, quem, motivo)         -> muda o número do load, o item e a fábrica (vale para todos os lotes dele);
--   excluir_recebimento(lote_id, quem, motivo)            -> ARQUIVA o lote em registros_excluidos e o tira da tabela viva;
--   recuperar_recebimento(registro_excluido_id, motivo, quem) -> Admin: reinsere o lote com o MESMO id.
--
-- Decisões do Danyllo (23/10/2026): corrigir o lote e o load; excluir é lote por lote; **sem motivo obrigatório** (recebimento é
-- registro, como a coleta; o motivo é opcional e vai para o histórico); lote com C.T/B.L lido, numa composta ou com teste
-- (TAB, Coliformes): exclusão RECUSADA (primeiro se resolve o que está ligado a ele). Recuperar pede motivo (Admin).
--
-- Quem pode (conferido AQUI, por p_quem): Admin e Analista; Coletor, Consultor e desconhecidos: ninguém; recuperar: só Admin.
-- Corrigir o lote: o número muda mesmo com resultado (os resultados, a composta e os testes seguem o lote pelo id); a DATA só
-- muda sem C.T/B.L lido e sem teste, porque os prazos (C.T 48h, B.L 72h e 120h) saem dela. Lote repetido no load: recusado.
-- Corrigir o load: número só com dígitos (4 a 6); item e fábrica válidos; o item 129 (NFC) não troca com outro item, porque
-- o NFC tem tabela própria; load + item que já exista: recusado (junte os lotes à mão com um Admin).
-- Funções SECURITY DEFINER com search_path fixo e dono labflow_app, como na 033. O GRANT EXECUTE para o papel do app fica numa
-- migration do app (como a 056 fez para as coletas).

BEGIN;

-- Confere quem é a pessoa e se pode mexer em recebimento (Admin e Analista).
CREATE OR REPLACE FUNCTION recebimento_exigir_permissao(p_quem bigint) RETURNS void AS $$
DECLARE
    v_cargo text;
BEGIN
    SELECT cargo INTO v_cargo FROM usuarios WHERE id = p_quem;
    IF v_cargo IS NULL THEN
        RAISE EXCEPTION 'Pessoa não encontrada.';
    END IF;
    IF v_cargo NOT IN ('Admin', 'Analista') THEN
        RAISE EXCEPTION 'Seu cargo não pode corrigir ou excluir recebimento.';
    END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION corrigir_recebimento(p_id bigint, p_campos jsonb, p_quem bigint, p_motivo text DEFAULT NULL)
RETURNS recebimento_lotes AS $$
DECLARE
    v_antes recebimento_lotes;
    v       recebimento_lotes;
    v_chave text;
    v_lote  int;
    v_data  date;
    v_ant   jsonb := '{}'::jsonb;
    v_dep   jsonb := '{}'::jsonb;
BEGIN
    PERFORM recebimento_exigir_permissao(p_quem);
    SELECT * INTO v_antes FROM recebimento_lotes WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lote do recebimento não encontrado.';
    END IF;
    IF p_campos IS NULL OR jsonb_typeof(p_campos) <> 'object' OR p_campos = '{}'::jsonb THEN
        RAISE EXCEPTION 'Diga o que corrigir: lote ou data_recebimento.';
    END IF;
    FOR v_chave IN SELECT jsonb_object_keys(p_campos) LOOP
        IF v_chave IN ('load', 'load_id', 'item', 'fabrica') THEN
            RAISE EXCEPTION 'O load, o item e a fábrica se corrigem no load (vale para todos os lotes dele).';
        ELSIF v_chave NOT IN ('lote', 'data_recebimento') THEN
            RAISE EXCEPTION 'Esse campo não pode ser corrigido: %.', v_chave;
        END IF;
    END LOOP;

    v_lote := v_antes.lote;
    v_data := v_antes.data_recebimento;
    IF p_campos ? 'lote' THEN
        IF COALESCE(p_campos ->> 'lote', '') !~ '^[0-9]{1,4}$' OR (p_campos ->> 'lote')::int < 1 THEN
            RAISE EXCEPTION 'Número do lote inválido.';
        END IF;
        v_lote := (p_campos ->> 'lote')::int;
    END IF;
    IF p_campos ? 'data_recebimento' THEN
        BEGIN
            v_data := (p_campos ->> 'data_recebimento')::date;
        EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'Data do recebimento inválida.';
        END;
        IF v_data IS NULL THEN
            RAISE EXCEPTION 'Data do recebimento inválida.';
        END IF;
        IF v_data <> v_antes.data_recebimento THEN
            IF EXISTS (SELECT 1 FROM contagens WHERE recebimento_lote_id = p_id) THEN
                RAISE EXCEPTION 'O lote já tem C.T ou B.L lido: a data não pode mudar.';
            END IF;
            IF EXISTS (SELECT 1 FROM testes WHERE recebimento_lote_id = p_id) THEN
                RAISE EXCEPTION 'O lote já tem teste (TAB ou Coliformes): a data não pode mudar.';
            END IF;
        END IF;
    END IF;

    IF v_lote = v_antes.lote AND v_data = v_antes.data_recebimento THEN
        RAISE EXCEPTION 'Nada mudou: os valores novos são iguais aos atuais.';
    END IF;
    IF EXISTS (SELECT 1 FROM recebimento_lotes k WHERE k.id <> p_id AND k.load_id = v_antes.load_id AND k.lote = v_lote) THEN
        RAISE EXCEPTION 'Esse load já tem o lote %.', v_lote;
    END IF;

    UPDATE recebimento_lotes SET lote = v_lote, data_recebimento = v_data WHERE id = p_id RETURNING * INTO v;

    IF v_lote <> v_antes.lote THEN v_ant := v_ant || jsonb_build_object('lote', v_antes.lote); v_dep := v_dep || jsonb_build_object('lote', v.lote); END IF;
    IF v_data <> v_antes.data_recebimento THEN v_ant := v_ant || jsonb_build_object('data_recebimento', v_antes.data_recebimento); v_dep := v_dep || jsonb_build_object('data_recebimento', v.data_recebimento); END IF;
    INSERT INTO historico_alteracoes (tipo, tabela, registro_id, antes, depois, motivo, quem)
    VALUES ('corrigido', 'recebimento_lotes', p_id, v_ant, v_dep, NULLIF(trim(COALESCE(p_motivo, '')), ''), p_quem);
    RETURN v;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Esse load já tem o lote %.', v_lote;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION corrigir_load(p_id bigint, p_campos jsonb, p_quem bigint, p_motivo text DEFAULT NULL) RETURNS loads AS $$
DECLARE
    v_antes   loads;
    v         loads;
    v_chave   text;
    v_numero  text;
    v_item    bigint;
    v_fabrica bigint;
    v_cod     text;
    v_sigla   text;
    v_nfc     bigint := (SELECT id FROM itens WHERE codigo = '129');
    v_ant     jsonb := '{}'::jsonb;
    v_dep     jsonb := '{}'::jsonb;
BEGIN
    PERFORM recebimento_exigir_permissao(p_quem);
    SELECT * INTO v_antes FROM loads WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Load não encontrado.';
    END IF;
    IF p_campos IS NULL OR jsonb_typeof(p_campos) <> 'object' OR p_campos = '{}'::jsonb THEN
        RAISE EXCEPTION 'Diga o que corrigir: numero, item ou fabrica.';
    END IF;
    FOR v_chave IN SELECT jsonb_object_keys(p_campos) LOOP
        IF v_chave NOT IN ('numero', 'item', 'fabrica') THEN
            RAISE EXCEPTION 'Esse campo não pode ser corrigido: %.', v_chave;
        END IF;
    END LOOP;

    v_numero  := v_antes.numero;
    v_item    := v_antes.item_id;
    v_fabrica := v_antes.fabrica_id;
    IF p_campos ? 'numero' THEN
        v_numero := trim(COALESCE(p_campos ->> 'numero', ''));
        IF v_numero !~ '^[0-9]{4,6}$' THEN
            RAISE EXCEPTION 'Número do load inválido: use só os dígitos (4 a 6).';
        END IF;
    END IF;
    IF p_campos ? 'item' THEN
        v_cod := trim(COALESCE(p_campos ->> 'item', ''));
        IF v_cod !~ '^[0-9]{1,6}$' THEN
            RAISE EXCEPTION 'Item inválido: use só os dígitos.';
        END IF;
        SELECT id INTO v_item FROM itens WHERE codigo = v_cod;
        IF v_item IS NULL THEN
            INSERT INTO itens (codigo) VALUES (v_cod) RETURNING id INTO v_item;
        END IF;
        IF v_item IS DISTINCT FROM v_antes.item_id AND (v_item = v_nfc OR v_antes.item_id = v_nfc) THEN
            RAISE EXCEPTION 'O item 129 (NFC) não troca com outro item: o NFC tem registro próprio. Exclua e registre de novo.';
        END IF;
    END IF;
    IF p_campos ? 'fabrica' THEN
        v_sigla := upper(trim(COALESCE(p_campos ->> 'fabrica', '')));
        IF v_sigla NOT IN ('AQA', 'CON', 'COL', 'UCH', 'ITA', 'TMG') THEN
            RAISE EXCEPTION 'Fábrica inválida. Use AQA, CON, COL, UCH, ITA ou TMG.';
        END IF;
        SELECT id INTO v_fabrica FROM fabricas WHERE nome = v_sigla;
        IF v_fabrica IS NULL THEN
            INSERT INTO fabricas (nome) VALUES (v_sigla) RETURNING id INTO v_fabrica;
        END IF;
    END IF;

    IF v_numero = v_antes.numero AND v_item = v_antes.item_id AND v_fabrica IS NOT DISTINCT FROM v_antes.fabrica_id THEN
        RAISE EXCEPTION 'Nada mudou: os valores novos são iguais aos atuais.';
    END IF;
    IF EXISTS (SELECT 1 FROM loads k WHERE k.id <> p_id AND k.numero = v_numero AND k.item_id = v_item) THEN
        RAISE EXCEPTION 'Já existe o load % com esse item: para juntar os lotes, peça a um Admin.', v_numero;
    END IF;

    UPDATE loads SET numero = v_numero, item_id = v_item, fabrica_id = v_fabrica WHERE id = p_id RETURNING * INTO v;

    IF v_numero <> v_antes.numero THEN v_ant := v_ant || jsonb_build_object('numero', v_antes.numero); v_dep := v_dep || jsonb_build_object('numero', v.numero); END IF;
    IF v_item <> v_antes.item_id THEN
        v_ant := v_ant || jsonb_build_object('item', (SELECT codigo FROM itens WHERE id = v_antes.item_id));
        v_dep := v_dep || jsonb_build_object('item', (SELECT codigo FROM itens WHERE id = v.item_id));
    END IF;
    IF v_fabrica IS DISTINCT FROM v_antes.fabrica_id THEN
        v_ant := v_ant || jsonb_build_object('fabrica', (SELECT nome FROM fabricas WHERE id = v_antes.fabrica_id));
        v_dep := v_dep || jsonb_build_object('fabrica', (SELECT nome FROM fabricas WHERE id = v.fabrica_id));
    END IF;
    INSERT INTO historico_alteracoes (tipo, tabela, registro_id, antes, depois, motivo, quem)
    VALUES ('corrigido', 'loads', p_id, v_ant, v_dep, NULLIF(trim(COALESCE(p_motivo, '')), ''), p_quem);
    RETURN v;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe o load % com esse item: para juntar os lotes, peça a um Admin.', v_numero;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION excluir_recebimento(p_id bigint, p_quem bigint, p_motivo text DEFAULT NULL) RETURNS registros_excluidos AS $$
DECLARE
    v_lote recebimento_lotes;
    v_reg  registros_excluidos;
BEGIN
    PERFORM recebimento_exigir_permissao(p_quem);
    SELECT * INTO v_lote FROM recebimento_lotes WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lote do recebimento não encontrado.';
    END IF;
    IF EXISTS (SELECT 1 FROM contagens WHERE recebimento_lote_id = p_id) THEN
        RAISE EXCEPTION 'O lote já tem C.T ou B.L lido: não dá para excluir.';
    END IF;
    IF EXISTS (SELECT 1 FROM composta_lotes WHERE recebimento_lote_id = p_id) THEN
        RAISE EXCEPTION 'O lote está numa composta: tire-o da composta antes de excluir.';
    END IF;
    IF EXISTS (SELECT 1 FROM testes WHERE recebimento_lote_id = p_id) THEN
        RAISE EXCEPTION 'O lote já tem teste (TAB ou Coliformes): não dá para excluir.';
    END IF;
    INSERT INTO registros_excluidos (tabela, registro_id, esquema, dados, motivo, excluido_por)
    VALUES ('recebimento_lotes', p_id, 1,
            jsonb_build_object('lote', to_jsonb(v_lote), 'load', (SELECT to_jsonb(l) FROM loads l WHERE l.id = v_lote.load_id)),
            NULLIF(trim(COALESCE(p_motivo, '')), ''), p_quem)
    RETURNING * INTO v_reg;
    DELETE FROM recebimento_lotes WHERE id = p_id;  -- o load fica (pode ter outros lotes, compostas ou NFC)
    INSERT INTO historico_alteracoes (tipo, tabela, registro_id, antes, depois, motivo, quem)
    VALUES ('excluido', 'recebimento_lotes', p_id, to_jsonb(v_lote), NULL, NULLIF(trim(COALESCE(p_motivo, '')), ''), p_quem);
    RETURN v_reg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recuperar_recebimento(p_excluido_id bigint, p_motivo text, p_quem bigint) RETURNS recebimento_lotes AS $$
DECLARE
    v_reg  registros_excluidos;
    v_lote recebimento_lotes;
    v_load loads;
    v      recebimento_lotes;
BEGIN
    IF p_quem IS NULL OR NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_quem AND cargo = 'Admin') THEN
        RAISE EXCEPTION 'Só administradores podem recuperar um recebimento excluído.';
    END IF;
    IF NULLIF(trim(COALESCE(p_motivo, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Para recuperar, escreva o motivo.';
    END IF;
    SELECT * INTO v_reg FROM registros_excluidos WHERE id = p_excluido_id AND tabela = 'recebimento_lotes' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registro excluído não encontrado.';
    END IF;
    IF v_reg.recuperado_em IS NOT NULL THEN
        RAISE EXCEPTION 'Esse lote já foi recuperado.';
    END IF;
    IF v_reg.esquema <> 1 THEN
        RAISE EXCEPTION 'Formato do registro excluído (esquema %) não é conhecido por esta função.', v_reg.esquema;
    END IF;
    v_lote := jsonb_populate_record(NULL::recebimento_lotes, v_reg.dados -> 'lote');
    -- o load pode ter sido apagado depois (ex.: fim do piloto): volta com o mesmo id
    IF NOT EXISTS (SELECT 1 FROM loads WHERE id = v_lote.load_id) THEN
        v_load := jsonb_populate_record(NULL::loads, v_reg.dados -> 'load');
        IF v_load.id IS NULL OR EXISTS (SELECT 1 FROM loads WHERE numero = v_load.numero AND item_id = v_load.item_id) THEN
            RAISE EXCEPTION 'O load desse lote não existe mais e não dá para recriá-lo: não dá para recuperar.';
        END IF;
        INSERT INTO loads OVERRIDING SYSTEM VALUE SELECT v_load.*;
    END IF;
    IF EXISTS (SELECT 1 FROM recebimento_lotes WHERE load_id = v_lote.load_id AND lote = v_lote.lote) THEN
        RAISE EXCEPTION 'Esse load já tem outro lote % registrado: não dá para recuperar este.', v_lote.lote;
    END IF;
    IF EXISTS (SELECT 1 FROM recebimento_lotes WHERE id = v_lote.id) THEN
        RAISE EXCEPTION 'O número desse lote já está em uso: não dá para recuperar.';
    END IF;
    INSERT INTO recebimento_lotes OVERRIDING SYSTEM VALUE SELECT v_lote.* RETURNING * INTO v;
    UPDATE registros_excluidos SET recuperado_em = now(), recuperado_por = p_quem, motivo_recuperacao = trim(p_motivo) WHERE id = v_reg.id;
    INSERT INTO historico_alteracoes (tipo, tabela, registro_id, antes, depois, motivo, quem)
    VALUES ('recuperado', 'recebimento_lotes', v.id, NULL, to_jsonb(v), trim(p_motivo), p_quem);
    RETURN v;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Esse lote já existe: não dá para recuperar este.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION recebimento_exigir_permissao(bigint), corrigir_recebimento(bigint, jsonb, bigint, text),
    corrigir_load(bigint, jsonb, bigint, text), excluir_recebimento(bigint, bigint, text), recuperar_recebimento(bigint, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recebimento_exigir_permissao(bigint), corrigir_recebimento(bigint, jsonb, bigint, text),
    corrigir_load(bigint, jsonb, bigint, text), excluir_recebimento(bigint, bigint, text), recuperar_recebimento(bigint, text, bigint) TO labflow_app;

COMMIT;
