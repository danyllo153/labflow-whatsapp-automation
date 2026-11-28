-- 088 - Lite sem Admin: a primeira pessoa que abre digita o nome e assume o registro que era o Admin (mesmo id)
--
-- Decisao do Danyllo (27/11): na primeira abertura da LabFlow Lite sem senha, o nome digitado passa a ser o do registro
-- inicial ("Administrador", telefone marcador 5500000000001), com o MESMO id: lancamentos e historico continuam dela.
-- O papel do app (labflow_app_web) so le `usuarios`; por isso este unico caminho e uma funcao que so troca o NOME desse
-- registro inicial e so enquanto ele ainda se chama "Administrador". Nao muda cargo, telefone nem cria pessoa, e nao serve
-- de nada na versao Completa (la nao existe esse registro inicial). cadastrar_usuario e trocar_cargo NAO mudam.
-- Desfazer: 088_lite_assumir_admin_desfazer.sql. Aplicar com o usuario dono do banco (lfadmin na Lite).

BEGIN;

CREATE OR REPLACE FUNCTION public.lite_assumir_admin(p_nome text) RETURNS usuarios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_nome text := NULLIF(trim(COALESCE(p_nome, '')), '');
    v      usuarios;
BEGIN
    IF v_nome IS NULL THEN
        RAISE EXCEPTION 'Escreva o nome da pessoa.';
    END IF;
    IF char_length(v_nome) > 40 THEN
        RAISE EXCEPTION 'Nome muito longo (máximo 40 letras).';
    END IF;
    IF v_nome ~ '[<>;[:cntrl:]]' THEN
        RAISE EXCEPTION 'Nome inválido: não use < > ; no nome.';
    END IF;
    SELECT * INTO v FROM usuarios
     WHERE telefone = '5500000000001' AND cargo = 'Admin' AND nome = 'Administrador'
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Não há registro inicial para assumir.';
    END IF;
    UPDATE usuarios SET nome = v_nome WHERE id = v.id RETURNING * INTO v;
    RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION public.lite_assumir_admin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lite_assumir_admin(text) TO labflow_app_web;

COMMIT;
