-- 080 — app: ajustes da água de consumo (pedidos do Danyllo de 27/10, depois de testar a 079)
--
-- Faixa do app (050–099). Desfazer: 080_app_agua_consumo_ajustes_desfazer.sql.
-- Aplicar com o administrador do banco, depois de um backup.
--
-- - pontos.semanal: o ponto do MENSAL que também é ponto fixo do semanal. Nele, além de C.T, B.L, Coliformes e E.coli,
--   se medem pH e cloro livre (na hora). O Admin marca no app (Pontos e limites); aqui já vêm marcados os pontos do
--   mensal com o mesmo nome de um ponto do semanal da unidade.
-- - resultados.semanal: a marca copiada na coleta (como o nome): mudar o ponto depois não muda o que já foi coletado.
-- - a coleta mensal com linhas marcadas entra também nos laudos semanais (físico-química: pH, cloro e observação;
--   microbiológica: Coliformes e E.coli), só com essas linhas; a folha mensal continua com todos os pontos. Na semana
--   da mensal, ela vale como a coleta semanal.
-- - quem analisou e quando, à parte para a físico-química (pH e cloro, na hora) e a microbiológica (Coliformes e
--   E.coli): escolhidos na leitura (o nome como está escrito, que é o que sai no cabeçalho do laudo semanal). As
--   coletas já lançadas ficam com a análise de antes (analisada_em/analisada_por) nas duas.

BEGIN;

ALTER TABLE app.pontos_agua_consumo ADD COLUMN semanal boolean NOT NULL DEFAULT false;
ALTER TABLE app.pontos_agua_consumo ADD CONSTRAINT pontos_agua_consumo_semanal_so_no_mensal CHECK (tipo = 'mensal' OR NOT semanal);
ALTER TABLE app.resultados_agua_consumo ADD COLUMN semanal boolean NOT NULL DEFAULT false;

ALTER TABLE app.coletas_agua_consumo
    ADD COLUMN fq_analisada_em timestamptz,
    ADD COLUMN fq_analisada_por text CHECK (fq_analisada_por IS NULL OR length(trim(fq_analisada_por)) BETWEEN 1 AND 60),
    ADD COLUMN micro_analisada_em timestamptz,
    ADD COLUMN micro_analisada_por text CHECK (micro_analisada_por IS NULL OR length(trim(micro_analisada_por)) BETWEEN 1 AND 60);

UPDATE app.coletas_agua_consumo c
SET fq_analisada_em = c.analisada_em, micro_analisada_em = c.analisada_em,
    fq_analisada_por = left(coalesce(u.nome, cr.usuario), 60), micro_analisada_por = left(coalesce(u.nome, cr.usuario), 60)
FROM usuarios u LEFT JOIN app.credenciais cr ON cr.usuario_id = u.id
WHERE u.id = c.analisada_por;

UPDATE app.pontos_agua_consumo m SET semanal = true
WHERE m.tipo = 'mensal'
  AND EXISTS (SELECT 1 FROM app.pontos_agua_consumo s
              WHERE s.unidade = m.unidade AND s.tipo = 'semanal' AND s.ativo AND lower(s.nome) = lower(m.nome));

COMMIT;
