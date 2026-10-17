-- 031 — funções do banco para cadastrar pessoa e trocar cargo (pedido PB5 da sessão do app)
--
-- Depende da 001 (usuarios) e da 029 (cargo Coletor). Aplicar com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 031_funcoes_usuarios.sql
--
-- A regra de cadastro fica num lugar só e serve ao bot (comando "adicionar cargo ...") e à tela "Nova pessoa" do app:
--   cadastrar_usuario(nome, telefone, cargo, quem)  -> cria a pessoa (telefone obrigatório, só dígitos com DDI: 12 ou 13);
--   trocar_cargo(usuario_id, cargo, quem)           -> troca o cargo de quem já existe;
--   gravar_cargo_bot(telefone, nome, cargo, quem_telefone) -> o que o bot chama: cria ou troca e devolve 'ok' ou 'erro: ...'
--                                                              (o bot mostra o erro no WhatsApp em vez de falhar em silêncio).
-- Regras conferidas aqui, no banco (não só no bot ou no app):
--   * só Admin cadastra e troca cargo; cargos válidos: Admin, Operador, Consultor, Coletor;
--   * telefone já cadastrado não cria de novo (use trocar_cargo); o banco nunca fica sem Admin;
--   * "quem" é o id de quem está fazendo (o app passa a pessoa logada; o bot, quem mandou a mensagem).
-- Só labflow_app executa (o usuário de leitura do painel não).
--
-- Pedido da sessão do app (17/10/2026): o app conecta com um papel que NÃO tem INSERT/UPDATE nas tabelas do bot. Por isso
-- cadastrar_usuario e trocar_cargo (as que o app chama) são SECURITY DEFINER: rodam com o dono (labflow_app, o papel que
-- cria as tabelas, rodando esta migration), com SET search_path = public, pg_temp (padrão de segurança do SECURITY DEFINER,
-- que impede objeto falso num schema do chamador). A permissão continua conferida DENTRO da função, por p_quem
-- (usuario_exigir_admin). O GRANT EXECUTE para o papel do app fica numa migration do app (051), não aqui.
-- Rodar como labflow_app: o dono da função precisa ser quem tem permissão nas tabelas.

BEGIN;

CREATE OR REPLACE FUNCTION usuario_exigir_admin(p_quem bigint) RETURNS void AS $$
BEGIN
    IF p_quem IS NULL OR NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_quem AND cargo = 'Admin') THEN
        RAISE EXCEPTION 'Só administradores podem cadastrar pessoas ou trocar cargos.';
    END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION cadastrar_usuario(p_nome text, p_telefone text, p_cargo text, p_quem bigint) RETURNS usuarios AS $$
DECLARE
    v_tel  text := regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g');
    v_nome text := NULLIF(trim(COALESCE(p_nome, '')), '');
    v      usuarios;
BEGIN
    PERFORM usuario_exigir_admin(p_quem);
    IF v_tel !~ '^[0-9]{12,13}$' THEN
        RAISE EXCEPTION 'Telefone inválido: use DDI + DDD + número (12 ou 13 dígitos), ex.: 5511987654321.';
    END IF;
    IF p_cargo IS NULL OR p_cargo NOT IN ('Admin', 'Operador', 'Consultor', 'Coletor') THEN
        RAISE EXCEPTION 'Cargo inválido. Use Admin, Operador, Consultor ou Coletor.';
    END IF;
    IF v_nome IS NOT NULL AND length(v_nome) > 80 THEN
        RAISE EXCEPTION 'Nome muito longo (máximo 80 letras).';
    END IF;
    IF EXISTS (SELECT 1 FROM usuarios WHERE telefone = v_tel) THEN
        RAISE EXCEPTION 'Esse telefone já está cadastrado; para mudar o cargo use a troca de cargo.';
    END IF;
    INSERT INTO usuarios (telefone, nome, cargo) VALUES (v_tel, v_nome, p_cargo) RETURNING * INTO v;
    RETURN v;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION trocar_cargo(p_usuario_id bigint, p_cargo text, p_quem bigint) RETURNS usuarios AS $$
DECLARE
    v_atual usuarios;
    v       usuarios;
BEGIN
    PERFORM usuario_exigir_admin(p_quem);
    IF p_cargo IS NULL OR p_cargo NOT IN ('Admin', 'Operador', 'Consultor', 'Coletor') THEN
        RAISE EXCEPTION 'Cargo inválido. Use Admin, Operador, Consultor ou Coletor.';
    END IF;
    SELECT * INTO v_atual FROM usuarios WHERE id = p_usuario_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pessoa não encontrada.';
    END IF;
    IF v_atual.cargo = 'Admin' AND p_cargo <> 'Admin' AND (SELECT count(*) FROM usuarios WHERE cargo = 'Admin') <= 1 THEN
        RAISE EXCEPTION 'Não dá para tirar o cargo do único Admin: o sistema não pode ficar sem administrador.';
    END IF;
    UPDATE usuarios SET cargo = p_cargo WHERE id = p_usuario_id RETURNING * INTO v;
    RETURN v;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION gravar_cargo_bot(p_telefone text, p_nome text, p_cargo text, p_quem_telefone text) RETURNS text AS $$
DECLARE
    v_quem  bigint;
    v_alvo  bigint;
BEGIN
    SELECT id INTO v_quem FROM usuarios WHERE telefone = p_quem_telefone;
    SELECT id INTO v_alvo FROM usuarios WHERE telefone = regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g');
    IF v_alvo IS NULL THEN
        PERFORM cadastrar_usuario(p_nome, p_telefone, p_cargo, v_quem);
    ELSE
        PERFORM trocar_cargo(v_alvo, p_cargo, v_quem);
        IF NULLIF(trim(COALESCE(p_nome, '')), '') IS NOT NULL THEN
            UPDATE usuarios SET nome = trim(p_nome) WHERE id = v_alvo;
        END IF;
    END IF;
    RETURN 'ok';
EXCEPTION WHEN raise_exception THEN
    RETURN 'erro: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION usuario_exigir_admin(bigint), cadastrar_usuario(text, text, text, bigint),
    trocar_cargo(bigint, text, bigint), gravar_cargo_bot(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION usuario_exigir_admin(bigint), cadastrar_usuario(text, text, text, bigint),
    trocar_cargo(bigint, text, bigint), gravar_cargo_bot(text, text, text, text) TO labflow_app;

COMMIT;