-- 053 — app (web e celular): entrada no turno como check-in (hora do clique) e correção com motivo
--
-- Faixa do app (050–099). Spec: 07-app-pwa.md, "2. Entrar no turno" (decidido pelo Danyllo em 23/10: a entrada e a
-- saída valem a hora do clique; a pessoa corrige o próprio horário só com motivo, e o horário registrado fica guardado).
-- Tarefa: APP-022b. Desfazer: 053_app_turno_checkin_desfazer.sql. Depende da 052. Aplicar com o administrador do banco,
-- depois de um backup. Nenhuma tabela do bot é alterada.

BEGIN;

ALTER TABLE app.entradas_turno
    ADD COLUMN entrada_registrada timestamptz,          -- hora do clique em "Entrar no turno" (nunca muda)
    ADD COLUMN saida_registrada   timestamptz,          -- hora do clique em "Sair do turno" ou do fim automático
    ADD COLUMN motivo_correcao    text CHECK (motivo_correcao IS NULL OR length(trim(motivo_correcao)) BETWEEN 5 AND 300),
    ADD COLUMN corrigida_por      bigint REFERENCES usuarios (id);

-- entradas que já existiam: o horário que está lá é o registrado
UPDATE app.entradas_turno SET entrada_registrada = entrada, saida_registrada = saida;

ALTER TABLE app.entradas_turno
    ALTER COLUMN entrada_registrada SET DEFAULT now(),
    ALTER COLUMN entrada_registrada SET NOT NULL,
    ADD CONSTRAINT entradas_turno_correcao_com_motivo CHECK ((corrigida_por IS NULL) = (motivo_correcao IS NULL));

COMMIT;
