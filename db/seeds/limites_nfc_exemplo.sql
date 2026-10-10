-- Limites de NFC e do Howard de EXEMPLO (valores FICTÍCIOS, só para a demonstração e os testes)
--
-- Os limites reais são confidenciais (CLAUDE.md, Dados e segurança): ficam num arquivo
-- fora do Git, no mesmo formato deste, carregado direto no banco. Nunca commitar o real.
-- Recarregar: apaga os limites e grava os deste arquivo.
-- Aplicar: psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f limites_nfc_exemplo.sql

BEGIN;

DELETE FROM limites_nfc;
DELETE FROM limites_howard;

INSERT INTO limites_nfc (sub_analise, metodo, etapa, limite_max, vigente_de) VALUES
  ('CT',   'Profundidade', 'final', 40, '2026-01-01'),
  ('BL',   'Profundidade', 'pre',    3, '2026-01-01'),
  ('BL',   'Profundidade', 'final',  3, '2026-01-01'),
  ('WORT', 'Profundidade', 'pre',    3, '2026-01-01'),
  ('WORT', 'Profundidade', 'final',  3, '2026-01-01'),
  ('WORT', 'Superficie',   'pre',    3, '2026-01-01'),
  ('WORT', 'Superficie',   'final',  3, '2026-01-01');

-- Howard (%), acima disso é não ok (migration 017)
INSERT INTO limites_howard (limite_max, vigente_de) VALUES (24, '2026-01-01');

COMMIT;
