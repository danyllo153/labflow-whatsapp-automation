-- 069 — app: o app (labflow_app_web) chama as funções da Fase E do bot (042 a 047)
--
-- Faixa do app (050–099). Fase E, passos E3 em diante (rumo-do-app.md). Depende da 042 a 047 (sessão do bot, PB12 a PB17).
-- Desfazer: 069_app_grant_funcoes_fase_e_desfazer.sql. Aplicar com o administrador do banco, depois de um backup.
-- Só as funções que recebem a pessoa (p_quem); as "..._pelo_bot" (pelo telefone) ficam só com o bot. A tanque_exigir_cargo
-- não entra: ela roda dentro das outras, que são SECURITY DEFINER, então o app nunca a chama direto.
-- As regras (quem pode, prévia "o que vai ser criado", recusas, alarmes) moram nas funções; o app só chama.

BEGIN;

GRANT EXECUTE ON FUNCTION
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
TO labflow_app_web;

COMMIT;
