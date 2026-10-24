-- 069 (desfazer) — tira do app (labflow_app_web) a permissão de chamar as funções da Fase E do bot (042 a 047)
--
-- Antes, tire do app as telas que chamam essas funções. Aplicar com o administrador do banco, depois de um backup.

BEGIN;

REVOKE EXECUTE ON FUNCTION
    -- 042 tanques (PB14)
    registrar_coleta(bigint, text, text, text[], date, text, boolean),
    registrar_analise(bigint, text, text[], text, date, boolean),
    concluir_leitura(bigint, jsonb),
    lancar_placas(bigint, jsonb, boolean),
    -- 043 compostas, TAB, Coliformes e Howard (PB13)
    criar_compostas(bigint, text, text, jsonb, boolean),
    teste_feito(bigint, text, bigint[], date, boolean),
    teste_acao(bigint, text, text, bigint[], text, numeric),
    -- 044 drops (PB15)
    concluir_drops(bigint, bigint[], text, int, text, boolean),
    abrir_desvio_drop(bigint, bigint),
    fechar_desvio_drop(bigint, bigint, int[]),
    -- 045 embarque (PB12)
    registrar_embarque(bigint, text, int, int, text, text, int[], date, boolean),
    criar_compostas_embarque(bigint, text, int, int, jsonb, boolean),
    -- 046 NFC recebido (PB16)
    registrar_recebimento_nfc(bigint, jsonb, boolean),
    lancar_contagem_nfc(bigint, jsonb, boolean),
    -- 047 desvio de tanque e leitura do dia (PB17)
    abrir_desvio_tanque(bigint, bigint, text),
    registrar_repeticao(bigint, bigint),
    finalizar_leitura_do_dia(bigint, boolean)
FROM labflow_app_web;

COMMIT;
