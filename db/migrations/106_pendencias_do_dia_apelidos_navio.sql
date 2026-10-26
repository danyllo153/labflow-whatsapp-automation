-- 106 — pendências do dia numa lista só (PB22) e apelidos de navio
--
-- 1) vw_pendencias_do_dia: o que está para fazer hoje (ou atrasado, herdado de outro turno) ALÉM das leituras de C.T/B.L e
--    de tanques: TAB no caldo para espalhar e incubar, Coliformes no caldo para estriar, TAB e Coliformes para ler, TAB em
--    confirmação (PCA), Coliformes aberto lote a lote, composta esperando o Coliformes obrigatório (104) ou o TAB, e o Stress
--    de tanque por fazer. O bot (comando "pendências do dia") e o app ("Análises a fazer hoje") leem a mesma lista.
--    Pedido do Danyllo de 25/10/2026.
-- 2) navio_apelidos: o nome que a pessoa escreve -> o nome oficial do navio (ex. fictício: O.ALFA -> O.ALFA II). Gatilho em
--    navios grava sempre o oficial; o bot troca o apelido no texto antes de entender o comando (lê a tabela junto com os
--    usuários). Os apelidos reais entram por um arquivo fora do Git, como as famílias do arquivo (105).
-- Aplicar ANTES de publicar o workflow que lê navio_apelidos (o "BD · Buscar usuários" passa a ler a tabela), como labflow_app:
--   psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f 106_pendencias_do_dia_apelidos_navio.sql
-- Desfazer: 106_pendencias_do_dia_apelidos_navio_desfazer.sql (publique antes o workflow anterior).

BEGIN;

-- apelidos de navio -------------------------------------------------------------------------------------------------------
CREATE TABLE navio_apelidos (
    apelido text PRIMARY KEY CHECK (apelido = upper(apelido)),
    nome    text NOT NULL CHECK (nome = upper(nome) AND nome <> apelido)
);

CREATE OR REPLACE FUNCTION navio_nome_oficial(p text) RETURNS text AS $$
    SELECT COALESCE((SELECT a.nome FROM navio_apelidos a WHERE a.apelido = upper(trim(p))), upper(trim(p)));
$$ LANGUAGE sql STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION navios_nome_oficial() RETURNS trigger AS $$
BEGIN
    NEW.nome := navio_nome_oficial(NEW.nome);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER navios_apelido BEFORE INSERT ON navios FOR EACH ROW EXECUTE FUNCTION navios_nome_oficial();

-- pendências do dia -------------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_pendencias_do_dia AS
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
tt AS (
    SELECT t.id, t.tipo, t.status, t.teste_pai_id, COALESCE(t.composta_id, pai.composta_id) AS composta_id,
           COALESCE(rl.lote, ea.numero) AS lote_filho, co.tanque, co.origem AS coleta_origem, co.data_coleta,
           CASE WHEN t.status = 'No caldo' THEN t.espalhar_prevista
                WHEN t.status = 'Em confirmação' THEN t.confirmacao_prevista
                ELSE t.leitura_prevista END AS prevista
    FROM testes t
    LEFT JOIN testes pai ON pai.id = t.teste_pai_id
    LEFT JOIN recebimento_lotes rl ON rl.id = t.recebimento_lote_id
    LEFT JOIN embarque_amostras ea ON ea.id = t.embarque_amostra_id
    LEFT JOIN coletas co ON co.id = t.coleta_id
    WHERE t.tipo IN ('TAB', 'COLIFORMES') AND t.status <> 'Concluída'
),
itens AS (
    -- etapas de TAB e Coliformes que vencem hoje ou já venceram
    SELECT CASE tt.tipo WHEN 'TAB' THEN 'TAB' ELSE 'Coliformes' END AS grupo,
           CASE WHEN tt.teste_pai_id IS NOT NULL THEN 'Coliformes: confirmação lote a lote'
                WHEN tt.tipo = 'TAB' AND tt.status = 'No caldo' THEN 'TAB: espalhar e incubar'
                WHEN tt.tipo = 'TAB' AND tt.status = 'Em confirmação' THEN 'TAB: confirmação (PCA)'
                WHEN tt.tipo = 'TAB' THEN 'TAB: ler'
                WHEN tt.status = 'No caldo' THEN 'Coliformes: estriar (tirar do caldo)'
                ELSE 'Coliformes: ler' END AS etapa,
           CASE WHEN tt.coleta_origem IS NOT NULL
                THEN 'tanque ' || tt.tanque || ' coleta ' || to_char(tt.data_coleta, 'DD/MM')
                ELSE '#' || tt.composta_id || COALESCE('.' || tt.lote_filho, '') || ' ' || v.rotulo
                     || CASE WHEN tt.lote_filho IS NULL
                             THEN CASE WHEN v.origem = 'embarque' THEN ' amostras ' ELSE ' lotes ' END || lista_compacta(v.lotes)
                             ELSE '' END END AS alvo,
           tt.prevista, 'testes'::text AS tabela, tt.id AS ref_id
    FROM tt LEFT JOIN vw_compostas v ON v.id = tt.composta_id, hoje
    WHERE tt.prevista <= hoje.d
    UNION ALL
    -- composta esperando o Coliformes obrigatório (104)
    SELECT 'Compostas', 'Coliformes por fazer (obrigatório)',
           '#' || p.composta_id || ' ' || p.rotulo || CASE WHEN p.origem = 'embarque' THEN ' amostras ' ELSE ' lotes ' END
               || lista_compacta(p.lotes),
           (p.criada_em AT TIME ZONE 'America/Sao_Paulo')::date, 'compostas', p.composta_id
    FROM vw_coliformes_pendentes p WHERE p.obrigatorio
    UNION ALL
    -- composta do recebimento sem TAB (as criadas a partir de 26/10/2026; as antigas do piloto ficam de fora)
    SELECT 'Compostas', 'TAB por fazer', '#' || v.id || ' ' || v.rotulo || ' lotes ' || lista_compacta(v.lotes),
           (c.criada_em AT TIME ZONE 'America/Sao_Paulo')::date, 'compostas', v.id
    FROM vw_compostas v JOIN compostas c ON c.id = v.id
    WHERE v.origem = 'recebimento' AND c.criada_em >= timestamptz '2026-10-26 00:00 America/Sao_Paulo'
      AND NOT EXISTS (SELECT 1 FROM testes t WHERE t.tipo = 'TAB' AND t.composta_id = v.id)
    UNION ALL
    -- tanque com o frasco Normal analisado e o Stress por fazer (o Stress leva a data que o analista disser)
    SELECT 'Tanques', 'Tanque: Stress por fazer',
           CASE WHEN c.origem = 'navio' THEN n.nome || ' ' || n.viagem || ' ' ELSE '' END || 'tanque ' || c.tanque
               || ' coleta ' || to_char(c.data_coleta, 'DD/MM'),
           min(a.data_analise) + 1, 'coletas', c.id
    FROM coletas c
    JOIN analises a ON a.coleta_id = c.id AND a.frasco = 'Normal'
    LEFT JOIN navios n ON n.id = c.navio_id
    WHERE NOT EXISTS (SELECT 1 FROM analises s WHERE s.coleta_id = c.id AND s.frasco = 'Stress')
    GROUP BY c.id, c.origem, n.nome, n.viagem, c.tanque, c.data_coleta
)
SELECT i.grupo, i.etapa, i.alvo, i.prevista, i.prevista < (SELECT d FROM hoje) AS atrasado, i.tabela, i.ref_id
FROM itens i;

-- o texto do bot: por etapa, os atrasados primeiro, até 8 alvos por etapa
CREATE OR REPLACE FUNCTION pendencias_do_dia_texto() RETURNS text AS $$
DECLARE
    v_txt text;
BEGIN
    SELECT string_agg(linha, E'\n' ORDER BY atrasados DESC, ordem, etapa) INTO v_txt FROM (
        SELECT etapa, min(CASE grupo WHEN 'Compostas' THEN 1 WHEN 'TAB' THEN 2 WHEN 'Coliformes' THEN 3 ELSE 4 END) AS ordem,
               count(*) FILTER (WHERE atrasado) AS atrasados,
               CASE WHEN count(*) FILTER (WHERE atrasado) > 0 THEN '⚠️ ' ELSE '• ' END || etapa || ' (' || count(*)
               || CASE WHEN count(*) FILTER (WHERE atrasado) > 0
                       THEN ', ' || count(*) FILTER (WHERE atrasado) || ' atrasado' || CASE WHEN count(*) FILTER (WHERE atrasado) > 1 THEN 's' ELSE '' END
                            || ' desde ' || to_char(min(prevista), 'DD/MM')
                       ELSE '' END || ')' || E'\n   '
               || array_to_string((array_agg(alvo ORDER BY prevista, alvo))[1:8], E'\n   ')
               || CASE WHEN count(*) > 8 THEN E'\n   e mais ' || (count(*) - 8) ELSE '' END AS linha
        FROM vw_pendencias_do_dia
        GROUP BY etapa
    ) x;
    RETURN COALESCE('📋 Pendências de hoje (além das leituras):' || E'\n' || v_txt,
                    '✅ Nenhuma pendência de TAB, Coliformes, compostas ou Stress hoje (as leituras saem no relatório do dia).');
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public, pg_temp;

GRANT SELECT ON navio_apelidos, vw_pendencias_do_dia TO labflow_app, labflow_app_web, labflow_leitura;
GRANT EXECUTE ON FUNCTION pendencias_do_dia_texto(), navio_nome_oficial(text) TO labflow_app, labflow_app_web;

COMMIT;
