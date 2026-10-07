-- Dados de DEMONSTRAÇÃO (fictícios) para o painel do Power BI: ~30 dias até hoje.
--
-- Faixas próprias, para não misturar com testes e para apagar fácil (db/seeds/limpar_demo.sql):
--   analistas "Ana (demo)", "Bruno (demo)", "Carla (demo)" (Consultor, números inválidos)
--   tanques de terra 80 a 95, navio DEMO STAR 900;
--   recebimento: loads 90001 a 90009 (itens 9100 e 9200, fábricas AQA, COL e UCH);
--   embarque: navios DEMO OCEAN 901 (linhas 1 e 2) e DEMO WAVE 902 (linha 1), loads 90011 a 90013
-- Datas relativas a CURRENT_DATE: rodar de novo outro dia gera outro período (limpar antes).
-- Aplicar: psql -U labflow_app -d labflow -v ON_ERROR_STOP=1 -f db/seeds/demo.sql

BEGIN;

INSERT INTO usuarios (telefone, nome, cargo) VALUES
  ('5500000000901', 'Ana (demo)', 'Consultor'),
  ('5500000000902', 'Bruno (demo)', 'Consultor'),
  ('5500000000903', 'Carla (demo)', 'Consultor');

CREATE TEMP TABLE demo_u AS
SELECT array_agg(id ORDER BY telefone) AS ids FROM usuarios WHERE telefone LIKE '55000000009%';

-- ---------- NFC: coletas de terra (2 por dia) e de navio (4 tanques, a cada 6 dias) ----------
INSERT INTO coletas (origem, tanque, data_coleta, registrado_por)
SELECT 'terra', (80 + ((k * 3 + j) % 16))::text, CURRENT_DATE - k, (SELECT ids[1 + (k + j) % 3] FROM demo_u)
FROM generate_series(1, 30) AS k, generate_series(0, 1) AS j;

INSERT INTO navios (nome, viagem) VALUES ('DEMO STAR', '900');
INSERT INTO coletas (origem, navio_id, tanque, data_coleta, registrado_por)
SELECT 'navio', (SELECT id FROM navios WHERE nome = 'DEMO STAR' AND viagem = '900'), t, CURRENT_DATE - k,
       (SELECT ids[1 + (k / 6) % 3] FROM demo_u)
FROM generate_series(6, 24, 6) AS k, unnest(ARRAY['1C', '2P', '3S', '4C']) AS t;

CREATE TEMP TABLE demo_col AS
SELECT c.id, c.origem, c.data_coleta, c.registrado_por FROM coletas c
WHERE c.registrado_por IN (SELECT unnest(ids) FROM demo_u);

-- drops: os vencidos ficam concluídos (alguns atrasados de propósito)
INSERT INTO drops (coleta_id, dia, data_prevista, status, concluido_por, concluido_em)
SELECT c.id, x.dia, c.data_coleta + x.dia,
       CASE WHEN c.data_coleta + x.dia < CURRENT_DATE AND (c.id + x.dia) % 9 <> 0 THEN 'Concluído' ELSE 'Pendente' END,
       CASE WHEN c.data_coleta + x.dia < CURRENT_DATE AND (c.id + x.dia) % 9 <> 0 THEN (SELECT ids[1 + (c.id % 3)::int] FROM demo_u) END,
       CASE WHEN c.data_coleta + x.dia < CURRENT_DATE AND (c.id + x.dia) % 9 <> 0 THEN (c.data_coleta + x.dia) + time '10:00' END
FROM demo_col c CROSS JOIN (VALUES (5), (10), (15)) AS x(dia);

INSERT INTO arquivo_amostras (coleta_id, tipo, data_descarte)
SELECT id, CASE origem WHEN 'terra' THEN 'bag' ELSE 'pote' END, data_coleta + 365 FROM demo_col;

-- análises (no mesmo dia da coleta: os prazos contam da data da análise; normal em dia sim dia não, stress a cada 4 dias), com status pelo tempo
INSERT INTO analises (coleta_id, frasco, sub_analise, metodo, data_analise, pre_leitura_prevista, leitura_final_prevista,
                      status, registrado_por, pre_leitura_por, leitura_final_por)
SELECT c.id, f.frasco, l.sub, l.met, c.data_coleta,
       CASE WHEN l.pre IS NULL THEN NULL ELSE c.data_coleta + l.pre END,
       c.data_coleta + l.fin,
       CASE WHEN c.id % 11 = 0 AND c.data_coleta + l.fin < CURRENT_DATE THEN
                 CASE WHEN l.pre IS NULL THEN 'Aguardando Leitura Final' ELSE 'Aguardando Pré-Leitura' END
            WHEN c.data_coleta + l.fin < CURRENT_DATE THEN 'Concluído'
            WHEN l.pre IS NOT NULL AND c.data_coleta + l.pre < CURRENT_DATE THEN 'Aguardando Leitura Final'
            WHEN l.pre IS NULL THEN 'Aguardando Leitura Final'
            ELSE 'Aguardando Pré-Leitura' END,
       c.registrado_por,
       CASE WHEN l.pre IS NOT NULL AND c.id % 11 <> 0 AND c.data_coleta + l.pre < CURRENT_DATE THEN c.registrado_por END,
       CASE WHEN c.id % 11 <> 0 AND c.data_coleta + l.fin < CURRENT_DATE THEN c.registrado_por END
FROM demo_col c
JOIN (VALUES ('Normal', 2), ('Stress', 4)) AS f(frasco, cada) ON (CURRENT_DATE - c.data_coleta) % f.cada = 0
CROSS JOIN (VALUES ('CT', 'Profundidade', NULL::int, 2), ('BL', 'Profundidade', 3, 5),
                   ('WORT', 'Profundidade', 5, 10), ('WORT', 'Superficie', 5, 10)) AS l(sub, met, pre, fin);

-- desvios de drop: um confirmado a 25 °C, um não confirmado, um aberto
INSERT INTO desvios_drop (drop_id, data_abertura, leitura_prevista, aberto_por, status, resultado, temperaturas, resultado_por, resultado_em)
SELECT d.id, d.data_prevista, d.data_prevista + 5, (SELECT ids[1] FROM demo_u),
       CASE n WHEN 3 THEN 'Em confirmação' ELSE 'Concluído' END,
       CASE n WHEN 1 THEN 'Confirmado' WHEN 2 THEN 'Não confirmado' END,
       CASE n WHEN 1 THEN ARRAY[25] ELSE '{}'::int[] END,
       CASE WHEN n < 3 THEN (SELECT ids[2] FROM demo_u) END,
       CASE WHEN n < 3 THEN (d.data_prevista + 4) + time '15:00' END
FROM (SELECT d.*, row_number() OVER (ORDER BY d.data_prevista) AS n
      FROM drops d JOIN demo_col c ON c.id = d.coleta_id
      WHERE d.status = 'Concluído' AND d.dia = 5
        AND d.data_prevista IN (CURRENT_DATE - 20, CURRENT_DATE - 12, CURRENT_DATE - 2)) d
WHERE n <= 3;

-- TAB dos tanques de terra (um a cada 4 dias de coleta), com o status pelo tempo: os mais recentes
-- no caldo ou incubados, os de 13 dias em confirmação (colônia na placa), alguns positivos
INSERT INTO testes (tipo, coleta_id, status, resultado, data_feito, feito_por, espalhar_prevista, espalhado_em, espalhado_por,
                    leitura_prevista, confirmacao_prevista, resultado_em, resultado_por)
SELECT 'TAB', c.id,
       CASE WHEN c.d = 13 THEN 'Em confirmação' WHEN f + 10 < CURRENT_DATE THEN 'Concluída'
            WHEN f + 5 <= CURRENT_DATE THEN 'Incubada' ELSE 'No caldo' END,
       CASE WHEN f + 10 < CURRENT_DATE AND c.d <> 13 THEN CASE WHEN c.d IN (17, 25) THEN 'Positivo' ELSE 'Negativo' END END,
       f, c.registrado_por, f + 5,
       CASE WHEN f + 5 <= CURRENT_DATE THEN (f + 5) + time '09:00' END,
       CASE WHEN f + 5 <= CURRENT_DATE THEN c.registrado_por END,
       CASE WHEN f + 5 <= CURRENT_DATE THEN f + 10 END,
       CASE WHEN c.d = 13 THEN f + 13 END,
       CASE WHEN f + 10 < CURRENT_DATE AND c.d <> 13 THEN (f + 10) + time '14:00' END,
       CASE WHEN f + 10 < CURRENT_DATE AND c.d <> 13 THEN c.registrado_por END
FROM (SELECT c.*, c.data_coleta + 1 AS f, CURRENT_DATE - c.data_coleta AS d FROM demo_col c
      WHERE c.origem = 'terra' AND (CURRENT_DATE - c.data_coleta) % 4 = 1) c;

-- ---------- Concentrado: recebimento de 9 loads de 10 lotes, um a cada 4 dias ----------
-- fábricas AQA, COL e UCH e itens 9100 e 9200 (o bot também cadastra assim; se já existirem, reaproveita)
INSERT INTO fabricas (nome) VALUES ('AQA'), ('COL'), ('UCH') ON CONFLICT (nome) DO NOTHING;
INSERT INTO itens (codigo) VALUES ('9100'), ('9200') ON CONFLICT (codigo) DO NOTHING;
INSERT INTO loads (numero, item_id, fabrica_id, criado_por)
SELECT (90000 + n)::text,
       (SELECT id FROM itens WHERE codigo = CASE WHEN n % 2 = 1 THEN '9100' ELSE '9200' END),
       (SELECT id FROM fabricas WHERE nome = (ARRAY['AQA', 'COL', 'UCH'])[1 + n % 3]),
       (SELECT ids[1 + n % 3] FROM demo_u)
FROM generate_series(1, 9) AS n;

CREATE TEMP TABLE demo_load AS
SELECT l.id, l.numero, CURRENT_DATE - (10 - (l.numero::int - 90000)) * 4 AS recebido
FROM loads l
WHERE l.numero::int BETWEEN 90001 AND 90009 AND l.item_id IN (SELECT id FROM itens WHERE codigo IN ('9100', '9200'));

INSERT INTO recebimento_lotes (load_id, lote, data_recebimento, registrado_por)
SELECT l.id, n, l.recebido, (SELECT ids[1 + n % 3] FROM demo_u)
FROM demo_load l, generate_series(1, 10) AS n;

-- C.T e B.L dos lotes já vencidos (alguns acima do limite, para os alarmes)
INSERT INTO contagens (analise, recebimento_lote_id, sinal, valor, lido_por, lido_em)
SELECT a.analise, rl.id,
       CASE WHEN (rl.lote + l.id) % 4 = 0 THEN '=' ELSE '<' END,
       CASE WHEN a.analise = 'CT' AND (rl.lote * 7 + l.id) % 17 = 0 THEN 250
            WHEN a.analise <> 'CT' AND (rl.lote * 5 + l.id) % 19 = 0 THEN 60
            WHEN (rl.lote + l.id) % 4 = 0 THEN 10 * (1 + rl.lote % 3)
            ELSE 10 END,
       (SELECT ids[1 + (rl.lote + a.dias) % 3] FROM demo_u),
       (l.recebido + a.dias) + time '11:00'
FROM demo_load l
JOIN recebimento_lotes rl ON rl.load_id = l.id
CROSS JOIN (VALUES ('CT', 2), ('BL72', 3), ('BL120', 5)) AS a(analise, dias)
WHERE l.recebido + a.dias < CURRENT_DATE
  AND NOT (l.numero = '90008' AND rl.lote IN (4, 9) AND a.analise = 'BL72'); -- dois B.L esquecidos (atrasados)
-- quem passou do limite ficou com sinal '=' (valor exato)
UPDATE contagens SET sinal = '=' WHERE valor >= 50 AND recebimento_lote_id IN (SELECT rl.id FROM recebimento_lotes rl JOIN demo_load l ON l.id = rl.load_id);

-- compostas (1-5)(6-10) de cada load
INSERT INTO compostas (load_id, criada_por)
SELECT l.id, (SELECT ids[1] FROM demo_u) FROM demo_load l, generate_series(1, 2);
INSERT INTO composta_lotes (composta_id, recebimento_lote_id)
SELECT c.id, rl.id
FROM (SELECT c.id, c.load_id, row_number() OVER (PARTITION BY c.load_id ORDER BY c.id) AS g
      FROM compostas c JOIN demo_load l ON l.id = c.load_id) c
JOIN recebimento_lotes rl ON rl.load_id = c.load_id AND ((c.g = 1 AND rl.lote <= 5) OR (c.g = 2 AND rl.lote > 5));

-- ---------- Concentrado: embarque (DEMO OCEAN 901 linhas 1 e 2; DEMO WAVE 902 linha 1; fase 1; 10 amostras cada) ----------
-- load de embarque sem fábrica (como o bot cadastra load antigo): 90011, 90012 e 90013
INSERT INTO navios (nome, viagem) VALUES ('DEMO OCEAN', '901'), ('DEMO WAVE', '902');
INSERT INTO loads (numero, item_id, criado_por)
SELECT (90010 + n)::text, (SELECT id FROM itens WHERE codigo = CASE WHEN n = 2 THEN '9200' ELSE '9100' END), (SELECT ids[n] FROM demo_u)
FROM generate_series(1, 3) AS n;
INSERT INTO embarques (navio_id, linha, fase, criado_por)
SELECT (SELECT id FROM navios WHERE (nome, viagem) = (x.nome, x.viagem)), x.linha, 1, (SELECT ids[x.k] FROM demo_u)
FROM (VALUES (1, 'DEMO OCEAN', '901', 1), (2, 'DEMO OCEAN', '901', 2), (3, 'DEMO WAVE', '902', 1)) AS x(k, nome, viagem, linha);

CREATE TEMP TABLE demo_emb AS
SELECT e.id, e.linha, l.id AS load_id, CURRENT_DATE - x.dias AS embarcado, x.k
FROM (VALUES (1, 'DEMO OCEAN', 1, 31), (2, 'DEMO OCEAN', 2, 16), (3, 'DEMO WAVE', 1, 4)) AS x(k, navio, linha, dias)
JOIN navios n ON n.nome = x.navio AND n.viagem IN ('901', '902')
JOIN embarques e ON e.navio_id = n.id AND e.linha = x.linha
JOIN loads l ON l.numero = (90010 + x.k)::text AND l.item_id IN (SELECT id FROM itens WHERE codigo IN ('9100', '9200'));

INSERT INTO embarque_amostras (embarque_id, load_id, numero, data_embarque, registrado_por)
SELECT e.id, e.load_id, n, e.embarcado, (SELECT ids[1 + n % 3] FROM demo_u)
FROM demo_emb e, generate_series(1, 10) AS n;

-- C.T e B.L das amostras já vencidas: um C.T esquecido (atrasado) e dois alarmes
INSERT INTO contagens (analise, embarque_amostra_id, sinal, valor, lido_por, lido_em)
SELECT a.analise, ea.id,
       CASE WHEN (e.k = 1 AND ea.numero = 3 AND a.analise = 'CT') OR (e.k = 2 AND ea.numero = 9 AND a.analise = 'BL72')
            THEN '=' ELSE '<' END,
       CASE WHEN e.k = 1 AND ea.numero = 3 AND a.analise = 'CT' THEN 230
            WHEN e.k = 2 AND ea.numero = 9 AND a.analise = 'BL72' THEN 70
            ELSE 10 END,
       (SELECT ids[1 + (ea.numero + a.dias) % 3] FROM demo_u),
       (e.embarcado + a.dias) + time '11:00'
FROM demo_emb e
JOIN embarque_amostras ea ON ea.embarque_id = e.id
CROSS JOIN (VALUES ('CT', 2), ('BL72', 3), ('BL120', 5)) AS a(analise, dias)
WHERE e.embarcado + a.dias < CURRENT_DATE
  AND NOT (e.k = 3 AND ea.numero = 7 AND a.analise = 'CT');

-- compostas (A1-A5)(A6-A10) de cada linha
INSERT INTO compostas (embarque_id, criada_por)
SELECT e.id, (SELECT ids[2] FROM demo_u) FROM demo_emb e, generate_series(1, 2);
INSERT INTO composta_lotes (composta_id, embarque_amostra_id)
SELECT c.id, ea.id
FROM (SELECT c.id, c.embarque_id, row_number() OVER (PARTITION BY c.embarque_id ORDER BY c.id) AS g
      FROM compostas c JOIN demo_emb e ON e.id = c.embarque_id) c
JOIN embarque_amostras ea ON ea.embarque_id = c.embarque_id AND ((c.g = 1 AND ea.numero <= 5) OR (c.g = 2 AND ea.numero > 5));

-- ---------- TAB (10 dias) e Coliformes (2 dias) de todas as compostas (recebimento e embarque) ----------
-- status pelo tempo: no caldo, incubado (TAB) ou estriado (Coliformes), em confirmação nos 3 dias depois
-- da leitura (metade das compostas) e concluído com resultado; ~20% positivos
CREATE TEMP TABLE demo_comp AS
SELECT c.id, l.recebido + 1 AS f FROM compostas c JOIN demo_load l ON l.id = c.load_id
UNION ALL
SELECT c.id, e.embarcado + 1 FROM compostas c JOIN demo_emb e ON e.id = c.embarque_id;

INSERT INTO testes (tipo, composta_id, status, resultado, data_feito, feito_por, espalhar_prevista, espalhado_em, espalhado_por,
                    leitura_prevista, confirmacao_prevista, resultado_em, resultado_por)
SELECT x.tipo, c.id,
       CASE WHEN z.confirma THEN 'Em confirmação'
            WHEN z.leu THEN 'Concluída'
            WHEN c.f + x.esp <= CURRENT_DATE THEN CASE x.tipo WHEN 'TAB' THEN 'Incubada' ELSE 'Estriada' END
            ELSE 'No caldo' END,
       CASE WHEN z.leu AND NOT z.confirma THEN CASE WHEN (c.id + length(x.tipo)) % 5 = 0 THEN 'Positivo' ELSE 'Negativo' END END,
       c.f, (SELECT ids[1 + (c.id % 3)::int] FROM demo_u),
       c.f + x.esp,
       CASE WHEN c.f + x.esp <= CURRENT_DATE THEN (c.f + x.esp) + time '09:00' END,
       CASE WHEN c.f + x.esp <= CURRENT_DATE THEN (SELECT ids[1 + ((c.id + 1) % 3)::int] FROM demo_u) END,
       CASE WHEN c.f + x.esp <= CURRENT_DATE THEN c.f + x.fim END,
       CASE WHEN z.confirma THEN c.f + x.fim + 3 END,
       CASE WHEN z.leu AND NOT z.confirma THEN (c.f + x.fim) + time '14:00' END,
       CASE WHEN z.leu AND NOT z.confirma THEN (SELECT ids[1 + ((c.id + 2) % 3)::int] FROM demo_u) END
FROM demo_comp c
CROSS JOIN (VALUES ('TAB', 5, 10), ('COLIFORMES', 1, 2)) AS x(tipo, esp, fim)
CROSS JOIN LATERAL (SELECT c.f + x.fim < CURRENT_DATE AS leu,
                           c.f + x.fim < CURRENT_DATE AND c.f + x.fim + 3 >= CURRENT_DATE AND c.id % 2 = 0 AS confirma) AS z;

-- Howard (só embarque): um dia, já concluído, campos positivos x 2 = %
INSERT INTO testes (tipo, composta_id, status, campos_positivos, percentual, data_feito, feito_por, resultado_em, resultado_por)
SELECT 'HOWARD', c.id, 'Concluída', p, p * 2, e.embarcado + 1, (SELECT ids[3] FROM demo_u),
       (e.embarcado + 1) + time '16:00', (SELECT ids[3] FROM demo_u)
FROM compostas c
JOIN demo_emb e ON e.id = c.embarque_id
CROSS JOIN LATERAL (SELECT (4 + (c.id % 5) * 3)::int AS p) AS h;

COMMIT;
