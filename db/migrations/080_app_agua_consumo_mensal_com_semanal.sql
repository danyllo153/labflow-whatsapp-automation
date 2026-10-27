-- 080 — app: na coleta mensal de Santos e do TMG, os pontos fixos do semanal valem também como a coleta semanal
--
-- Faixa do app (050–099). Pedido do Danyllo de 27/10. Desfazer: 080_app_agua_consumo_mensal_com_semanal_desfazer.sql.
-- Aplicar com o administrador do banco, depois de um backup.
--
-- - pontos.semanal: o ponto do MENSAL que também é ponto fixo do semanal. Nele, além de C.T, B.L, Coliformes e E.coli,
--   se medem pH e cloro livre (na hora). O Admin marca no app (Pontos e limites); aqui já vêm marcados os pontos do
--   mensal com o mesmo nome de um ponto do semanal da unidade.
-- - resultados.semanal: a marca copiada na coleta (como o nome): mudar o ponto depois não muda o que já foi coletado.
-- - a coleta mensal com linhas marcadas entra também nos laudos semanais (físico-química: pH, cloro e observação;
--   microbiológica: Coliformes e E.coli), só com essas linhas; a folha mensal continua com todos os pontos. Na semana
--   da mensal, ela vale como a coleta semanal.

BEGIN;

ALTER TABLE app.pontos_agua_consumo ADD COLUMN semanal boolean NOT NULL DEFAULT false;
ALTER TABLE app.pontos_agua_consumo ADD CONSTRAINT pontos_agua_consumo_semanal_so_no_mensal CHECK (tipo = 'mensal' OR NOT semanal);
ALTER TABLE app.resultados_agua_consumo ADD COLUMN semanal boolean NOT NULL DEFAULT false;

UPDATE app.pontos_agua_consumo m SET semanal = true
WHERE m.tipo = 'mensal'
  AND EXISTS (SELECT 1 FROM app.pontos_agua_consumo s
              WHERE s.unidade = m.unidade AND s.tipo = 'semanal' AND s.ativo AND lower(s.nome) = lower(m.nome));

COMMIT;
