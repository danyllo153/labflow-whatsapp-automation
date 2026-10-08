-- Apaga os dados de DEMONSTRAÇÃO gerados por db/seeds/demo.sql (e só eles).
-- Aplicar: psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f db/seeds/limpar_demo.sql

BEGIN;

-- coletas dos analistas demo (CASCADE leva drops, arquivo, análises, desvios e o TAB dos tanques)
DELETE FROM coletas
WHERE registrado_por IN (SELECT id FROM usuarios WHERE telefone LIKE '55000000009%');

-- embarques demo (CASCADE leva amostras, compostas, testes e contagens do embarque)
DELETE FROM embarques
WHERE navio_id IN (SELECT id FROM navios WHERE (nome, viagem) IN (('DEMO OCEAN', '901'), ('DEMO WAVE', '902'), ('D.SKY', '123'),
                   ('D.SUN', '142'), ('D.BLOSSOM', '223'), ('D.SEA', '333'), ('D.OCEAN', '333'), ('D.STAR', '434')));

-- loads demo: 90001 a 90016, só dos itens demo (CASCADE leva lotes, compostas, testes e contagens)
DELETE FROM loads
WHERE numero::text ~ '^900(0[1-9]|1[0-6])$'
  AND item_id IN (SELECT id FROM itens WHERE codigo IN ('900', '9100', '9200'));

DELETE FROM navios WHERE (nome, viagem) IN (('DEMO STAR', '900'), ('DEMO OCEAN', '901'), ('DEMO WAVE', '902'), ('D.SKY', '123'),
                                         ('D.SUN', '142'), ('D.BLOSSOM', '223'), ('D.SEA', '333'), ('D.OCEAN', '333'), ('D.STAR', '434'))
  AND NOT EXISTS (SELECT 1 FROM coletas c WHERE c.navio_id = navios.id)
  AND NOT EXISTS (SELECT 1 FROM embarques e WHERE e.navio_id = navios.id);
-- itens e fábricas só saem se ninguém mais usa (a AQA, por exemplo, pode ter load de verdade)
DELETE FROM itens WHERE codigo IN ('900', '9100', '9200') AND NOT EXISTS (SELECT 1 FROM loads l WHERE l.item_id = itens.id);
DELETE FROM fabricas WHERE nome IN ('DEMO', 'AQA', 'COL', 'UCH') AND NOT EXISTS (SELECT 1 FROM loads l WHERE l.fabrica_id = fabricas.id);

-- por último, os analistas demo (nunca toca nos usuários de verdade)
DELETE FROM usuarios WHERE telefone LIKE '55000000009%';

COMMIT;
