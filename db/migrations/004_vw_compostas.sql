-- 004 — view das compostas: load, item, fábrica e lotes de cada composta
--
-- Depende da 002. Usada pelas respostas do bot ("#4 load 77001 (1-5)")
-- e, depois, pelo relatório do dia (blocos FCOJ).

BEGIN;

CREATE OR REPLACE VIEW vw_compostas AS
SELECT c.id,
       l.numero AS load,
       it.codigo AS item,
       fb.nome AS fabrica,
       array_agg(rl.lote ORDER BY rl.lote) AS lotes
FROM compostas c
JOIN loads l ON l.id = c.load_id
JOIN itens it ON it.id = l.item_id
JOIN fabricas fb ON fb.id = l.fabrica_id
JOIN composta_lotes cl ON cl.composta_id = c.id
JOIN recebimento_lotes rl ON rl.id = cl.recebimento_lote_id
GROUP BY c.id, l.numero, it.codigo, fb.nome;

COMMIT;
