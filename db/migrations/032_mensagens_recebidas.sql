-- 032 — mensagens já recebidas: a mesma mensagem do WhatsApp só é processada uma vez
--
-- Depende de nada. Aplicar com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 032_mensagens_recebidas.sql
--
-- Motivo (16/10/2026): a foto do laudo leva mais de 1 minuto na IA e a Evolution reentrega a mesma mensagem
-- (mesmo key.id) a cada ~65 s enquanto não recebe a resposta do webhook. Cada reentrega rodava o fluxo inteiro e o
-- bot mandava a mesma resposta 3 vezes. O node "BD · Buscar usuários" grava o id aqui (ON CONFLICT DO NOTHING) e o
-- "Interpretar comando" descarta a mensagem cujo id já estava gravado. Os reenvios internos do bot (labflowReenvio,
-- labflowAudio) não têm id e não passam por aqui. Ids com mais de 2 dias são apagados no mesmo node.
-- Guarda só o id da mensagem e a hora (nenhum texto, telefone ou conteúdo).

BEGIN;

CREATE TABLE IF NOT EXISTS mensagens_recebidas (
    id           text PRIMARY KEY,
    recebida_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mensagens_recebidas_recebida_em ON mensagens_recebidas (recebida_em);

COMMIT;
