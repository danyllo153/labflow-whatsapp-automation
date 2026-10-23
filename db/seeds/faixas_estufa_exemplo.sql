-- Faixas de trabalho FICTÍCIAS das estufas, só para a demonstração e os testes (APP-027).
-- As faixas reais são confidenciais: ficam só no banco, cadastradas pelo Admin ou carregadas por um arquivo fora do Git.
-- Rodar depois da migration 055. Pode ser repetido: não duplica.

INSERT INTO app.faixas_estufa (estufa_id, minimo, maximo, vigente_desde)
SELECT id, 30.0 + (id % 3), 33.0 + (id % 3), DATE '2026-01-01'
FROM app.estufas
WHERE NOT auxiliar
ON CONFLICT (estufa_id, vigente_desde) DO NOTHING;
