-- 087 - nome de pessoa com no maximo 40 caracteres e sem < > ; (S0.1, seguranca desde o 1o dia)
--
-- Antes: usuarios.nome era text livre (a funcao cadastrar_usuario aceitava ate 80 e gravar_cargo_bot nao limitava).
-- Agora o proprio banco recusa: mais de 40 caracteres, e os caracteres < > ; e de controle (tentativa de script
-- ou de SQL colado no nome). Apostrofo e ponto continuam valendo (D'Avila, Jr.).
-- A trava entra como NOT VALID: nomes antigos nao quebram a migration nem impedem UPDATE de outras colunas.
-- Se nao houver nome antigo fora da regra, ela e validada na hora.
-- Desfazer: 087_nome_pessoa_limite_desfazer.sql. Aplicar com o usuario dono do banco (lfadmin na Lite).

BEGIN;

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_nome_seguro;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_nome_seguro
    CHECK (nome IS NULL OR (char_length(nome) <= 40 AND nome !~ '[<>;[:cntrl:]]')) NOT VALID;

DO $$
BEGIN
    BEGIN
        ALTER TABLE usuarios VALIDATE CONSTRAINT usuarios_nome_seguro;
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'Ha nome antigo fora da regra em usuarios; a trava vale so para cadastros novos. Corrija e rode VALIDATE CONSTRAINT usuarios_nome_seguro.';
    END;
END $$;

-- Mensagem clara na tela (a funcao ja limitava, mas em 80): agora 40.
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
    IF v_nome IS NOT NULL AND length(v_nome) > 40 THEN
        RAISE EXCEPTION 'Nome muito longo (máximo 40 letras).';
    END IF;
    IF v_nome IS NOT NULL AND v_nome ~ '[<>;[:cntrl:]]' THEN
        RAISE EXCEPTION 'Nome inválido: não use < > ; no nome.';
    END IF;
    IF EXISTS (SELECT 1 FROM usuarios WHERE telefone = v_tel) THEN
        RAISE EXCEPTION 'Esse telefone já está cadastrado; para mudar o cargo use a troca de cargo.';
    END IF;
    INSERT INTO usuarios (telefone, nome, cargo) VALUES (v_tel, v_nome, v_cargo) RETURNING * INTO v;
    RETURN v;
END;
$function$;

COMMIT;
