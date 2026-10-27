-- 077 — app: laudo finalizado pode ser reaberto (editar) e excluído; as linhas da folha excluída vão para uma folha nova
--
-- Faixa do app (050–099). Pedido do Danyllo de 27/10: em todos os laudos, mesmo os finalizados, editar, excluir ou imprimir
-- de novo; "Marcar como impressa" vira "Finalizar laudo" (a folha finalizada sai com o traço que fecha as linhas vazias).
-- Desfazer: 077_app_laudos_finalizar_excluir_desfazer.sql. Aplicar com o administrador do banco, depois de um backup.
--
-- Nada se apaga de verdade: a folha excluída ganha excluida_em/excluida_por e some da lista; as linhas dela (o registro ou o
-- lugar da linha) passam para uma folha nova. Por isso o lugar da linha, que não mudava (065, 070, 073, 076), agora pode
-- mudar: UPDATE só da coluna pagina_id.

BEGIN;

ALTER TABLE app.paginas_laudo
    ADD COLUMN excluida_em  timestamptz,
    ADD COLUMN excluida_por bigint REFERENCES usuarios (id);

ALTER TABLE app.laudos_esterilizacao
    ADD COLUMN excluida_em  timestamptz,
    ADD COLUMN excluida_por bigint REFERENCES usuarios (id);

GRANT UPDATE (pagina_id) ON app.laudo_linhas, app.recebimento_laudo, app.recebimento_nfc_laudo, app.incubacao_dias
    TO labflow_app_web;

COMMIT;
