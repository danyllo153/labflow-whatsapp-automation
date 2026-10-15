-- 029 — cargo "Coletor": só registra coleta e corrige/apaga a própria coleta
--
-- Depende da 001 (usuarios). Aplicar com:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 029_cargo_coletor.sql
--
-- O cargo novo é pedido pelo Admin com "adicionar cargo Coletor para o número <DDD...> nome <nome>".
-- A restrição de o que o Coletor pode fazer está no workflow (Interpretar comando e Validar resposta da IA);
-- aqui só a lista de cargos do banco passa a aceitar "Coletor".

BEGIN;

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_cargo_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_cargo_check CHECK (cargo IN ('Admin', 'Operador', 'Consultor', 'Coletor'));

COMMIT;