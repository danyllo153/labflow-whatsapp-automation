-- 020 — contador diário de uso da IA (limite por pessoa e no total)
--
-- Depende da 001. A IA (Gemini, Groq) tem limite de uso e, no plano gratuito, o excesso devolve erro.
-- Cada pedido de IA (texto livre, áudio, foto) soma 1 aqui ANTES de chamar o provedor; passou do limite
-- do dia, o bot responde "limite diário de IA atingido, use o formato do comando" e não chama ninguém.
--   * uso_ia: um contador por dia, pessoa e tipo ('texto', 'audio', 'foto')
--   * limites (por dia): 100 pedidos por pessoa e 500 no total. Estão no SQL do node "BD · Limite IA"
--     do n8n; para mudar, edite os dois números lá (a tabela só conta).
--   * o dia é o de Brasília (o banco já roda em America/Sao_Paulo)
-- Aplicar: psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 020_uso_ia.sql

BEGIN;

CREATE TABLE uso_ia (
    dia         date NOT NULL DEFAULT CURRENT_DATE,
    usuario_id  bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    tipo        text NOT NULL CHECK (tipo IN ('texto', 'audio', 'foto')),
    chamadas    integer NOT NULL DEFAULT 0 CHECK (chamadas >= 0),
    PRIMARY KEY (dia, usuario_id, tipo)
);

COMMENT ON TABLE uso_ia IS 'Pedidos de IA por dia, pessoa e tipo; serve de limite diário e de painel de uso';

COMMIT;
