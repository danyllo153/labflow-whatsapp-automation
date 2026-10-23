-- 035 — o cargo "Operador" passa a se chamar "Analista" (pedido PB7 da sessão do app; decidido pelo Danyllo em 23/10/2026)
--
-- Depende da 029 (trava do cargo com o Coletor), da 031 (cadastrar_usuario e trocar_cargo) e da 033 (coleta_exigir_permissao).
-- Aplicar, como labflow_app, depois de um backup:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 035_cargo_analista.sql
-- Desfazer: 035_cargo_analista_desfazer.sql.
--
-- O que muda:
--   * dados: quem era "Operador" vira "Analista" (as permissões são as mesmas);
--   * a trava usuarios_cargo_check passa a aceitar Admin, Analista, Consultor e Coletor;
--   * apelido por um tempo: quem ainda gravar "Operador" (app ou bot antigos, durante a troca) grava "Analista"
--     (gatilho usuarios_cargo_apelido, que roda antes da trava); as funções aceitam "Operador" pelo mesmo motivo;
--   * cadastrar_usuario, trocar_cargo e coleta_exigir_permissao conferem "Analista" e falam "Analista" nas mensagens.
-- Assinaturas, SECURITY DEFINER, search_path e permissões (GRANT da 031, 033 e 051) não mudam: é CREATE OR REPLACE.

BEGIN;

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_cargo_check;
UPDATE usuarios SET cargo = 'Analista' WHERE cargo = 'Operador';
ALTER TABLE usuarios ADD CONSTRAINT usuarios_cargo_check CHECK (cargo IN ('Admin', 'Analista', 'Consultor', 'Coletor'));

-- apelido: "Operador" gravado por quem ainda não trocou o nome vira "Analista"
CREATE OR REPLACE FUNCTION usuarios_cargo_apelido() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.cargo = 'Operador' THEN
        NEW.cargo := 'Analista';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS usuarios_cargo_apelido ON usuarios;
CREATE TRIGGER usuarios_cargo_apelido BEFORE INSERT OR UPDATE OF cargo ON usuarios
    FOR EACH ROW EXECUTE FUNCTION usuarios_cargo_apelido();

CREATE OR REPLACE FUNCTION public.cadastrar_usuario(p_nome text, p_telefone text, p_cargo text, p_quem bigint)
 RETURNS usuarios
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tel   text := regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g');
    v_nome  text := NULLIF(trim(COALESCE(p_nome, '')), '');
    v_cargo text := CASE WHEN p_cargo = 'Operador' THEN 'Analista' ELSE p_cargo END;  -- apelido (035)
    v       usuarios;
BEGIN
    PERFORM usuario_exigir_admin(p_quem);
    IF v_tel !~ '^[0-9]{12,13}$' THEN
        RAISE EXCEPTION 'Telefone inválido: use DDI + DDD + número (12 ou 13 dígitos), ex.: 5511987654321.';
    END IF;
    IF v_cargo IS NULL OR v_cargo NOT IN ('Admin', 'Analista', 'Consultor', 'Coletor') THEN
        RAISE EXCEPTION 'Cargo inválido. Use Admin, Analista, Consultor ou Coletor.';
    END IF;
    IF v_nome IS NOT NULL AND length(v_nome) > 80 THEN
        RAISE EXCEPTION 'Nome muito longo (máximo 80 letras).';
    END IF;
    IF EXISTS (SELECT 1 FROM usuarios WHERE telefone = v_tel) THEN
        RAISE EXCEPTION 'Esse telefone já está cadastrado; para mudar o cargo use a troca de cargo.';
    END IF;
    INSERT INTO usuarios (telefone, nome, cargo) VALUES (v_tel, v_nome, v_cargo) RETURNING * INTO v;
    RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trocar_cargo(p_usuario_id bigint, p_cargo text, p_quem bigint)
 RETURNS usuarios
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_cargo text := CASE WHEN p_cargo = 'Operador' THEN 'Analista' ELSE p_cargo END;  -- apelido (035)
    v_atual usuarios;
    v       usuarios;
BEGIN
    PERFORM usuario_exigir_admin(p_quem);
    IF v_cargo IS NULL OR v_cargo NOT IN ('Admin', 'Analista', 'Consultor', 'Coletor') THEN
        RAISE EXCEPTION 'Cargo inválido. Use Admin, Analista, Consultor ou Coletor.';
    END IF;
    SELECT * INTO v_atual FROM usuarios WHERE id = p_usuario_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pessoa não encontrada.';
    END IF;
    IF v_atual.cargo = 'Admin' AND v_cargo <> 'Admin' AND (SELECT count(*) FROM usuarios WHERE cargo = 'Admin') <= 1 THEN
        RAISE EXCEPTION 'Não dá para tirar o cargo do único Admin: o sistema não pode ficar sem administrador.';
    END IF;
    UPDATE usuarios SET cargo = v_cargo WHERE id = p_usuario_id RETURNING * INTO v;
    RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.coleta_exigir_permissao(p_id bigint, p_quem bigint)
 RETURNS coletas
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_cargo text;
    v       coletas;
BEGIN
    SELECT cargo INTO v_cargo FROM usuarios WHERE id = p_quem;
    IF v_cargo IS NULL THEN
        RAISE EXCEPTION 'Pessoa não encontrada.';
    END IF;
    IF v_cargo NOT IN ('Admin', 'Analista', 'Coletor') THEN
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
            RAISE EXCEPTION 'Essa coleta já tem análise, drop concluído ou TAB: peça a um Analista ou Admin.';
        END IF;
    END IF;
    RETURN v;
END;
$function$;

COMMIT;
