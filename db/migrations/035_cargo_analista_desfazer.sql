-- Desfaz a 035: "Analista" volta a ser "Operador" e as funções voltam como estavam (031 e 033). Backup antes.
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 035_cargo_analista_desfazer.sql

BEGIN;

DROP TRIGGER IF EXISTS usuarios_cargo_apelido ON usuarios;
DROP FUNCTION IF EXISTS usuarios_cargo_apelido();
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_cargo_check;
UPDATE usuarios SET cargo = 'Operador' WHERE cargo = 'Analista';
ALTER TABLE usuarios ADD CONSTRAINT usuarios_cargo_check CHECK (cargo IN ('Admin', 'Operador', 'Consultor', 'Coletor'));

CREATE OR REPLACE FUNCTION public.cadastrar_usuario(p_nome text, p_telefone text, p_cargo text, p_quem bigint)
 RETURNS usuarios
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.trocar_cargo(p_usuario_id bigint, p_cargo text, p_quem bigint)
 RETURNS usuarios
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

COMMIT;
