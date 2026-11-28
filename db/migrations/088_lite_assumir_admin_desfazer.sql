-- Desfaz a 088: tira a funcao que deixa a primeira pessoa da Lite assumir o registro inicial. Nenhum dado muda.

BEGIN;

DROP FUNCTION IF EXISTS public.lite_assumir_admin(text);

COMMIT;
