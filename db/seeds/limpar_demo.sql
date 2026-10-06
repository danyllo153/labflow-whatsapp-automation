-- Apaga os dados de DEMONSTRAÇÃO gerados por db/seeds/demo.sql (e só eles).
-- Aplicar: psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f db/seeds/limpar_demo.sql

BEGIN;

-- coletas dos analistas demo (CASCADE leva drops, arquivo, análises e desvios)
DELETE FROM coletas
WHERE registrado_por IN (SELECT id FROM usuarios WHERE telefone LIKE '55000000009%');

-- loads demo (CASCADE leva lotes, compostas, testes e contagens)
DELETE FROM loads
WHERE numero::text ~ '^9000[1-6]$' AND item_id = (SELECT id FROM itens WHERE codigo = '900');

DELETE FROM navios WHERE nome = 'DEMO STAR' AND viagem = '900'
  AND NOT EXISTS (SELECT 1 FROM coletas c WHERE c.navio_id = navios.id);
DELETE FROM itens WHERE codigo = '900' AND NOT EXISTS (SELECT 1 FROM loads l WHERE l.item_id = itens.id);
DELETE FROM fabricas WHERE nome = 'DEMO' AND NOT EXISTS (SELECT 1 FROM loads l WHERE l.fabrica_id = fabricas.id);

-- por último, os analistas demo (nunca toca nos usuários de verdade)
DELETE FROM usuarios WHERE telefone LIKE '55000000009%';

COMMIT;
