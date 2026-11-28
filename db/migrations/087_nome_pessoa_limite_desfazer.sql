-- Desfaz a 087: tira a trava do nome e volta o limite de 80 na cadastrar_usuario. Nenhum dado e apagado.

BEGIN;

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_nome_seguro;

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

COMMIT;
