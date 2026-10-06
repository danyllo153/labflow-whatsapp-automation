-- Dados de DEMONSTRAÇÃO (fictícios) para o painel do Power BI: ~30 dias até hoje.
--
-- Faixas próprias, para não misturar com testes e para apagar fácil (db/seeds/limpar_demo.sql):
--   analistas "Ana (demo)", "Bruno (demo)", "Carla (demo)" (Consultor, números inválidos)
--   tanques de terra 80 a 95, navio DEMO STAR 900, loads 90001 a 90006 (item 900, fábrica DEMO)
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

-- análises (dia seguinte à coleta, em dia sim dia não; stress a cada 4 dias), com status pelo tempo
INSERT INTO analises (coleta_id, frasco, sub_analise, metodo, data_analise, pre_leitura_prevista, leitura_final_prevista,
                      status, registrado_por, pre_leitura_por, leitura_final_por)
SELECT c.id, f.frasco, l.sub, l.met, c.data_coleta + 1,
       CASE WHEN l.pre IS NULL THEN NULL ELSE c.data_coleta + 1 + l.pre END,
       c.data_coleta + 1 + l.fin,
       CASE WHEN c.id % 11 = 0 AND c.data_coleta + 1 + l.fin < CURRENT_DATE THEN
                 CASE WHEN l.pre IS NULL THEN 'Aguardando Leitura Final' ELSE 'Aguardando Pré-Leitura' END
            WHEN c.data_coleta + 1 + l.fin < CURRENT_DATE THEN 'Concluído'
            WHEN l.pre IS NOT NULL AND c.data_coleta + 1 + l.pre < CURRENT_DATE THEN 'Aguardando Leitura Final'
            WHEN l.pre IS NULL THEN 'Aguardando Leitura Final'
            ELSE 'Aguardando Pré-Leitura' END,
       c.registrado_por,
       CASE WHEN l.pre IS NOT NULL AND c.id % 11 <> 0 AND c.data_coleta + 1 + l.pre < CURRENT_DATE THEN c.registrado_por END,
       CASE WHEN c.id % 11 <> 0 AND c.data_coleta + 1 + l.fin < CURRENT_DATE THEN c.registrado_por END
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

-- ---------- Concentrado: 6 loads de 10 lotes, recebidos a cada 5 dias ----------
INSERT INTO fabricas (nome) VALUES ('DEMO');
INSERT INTO itens (codigo) VALUES ('900');
INSERT INTO loads (numero, item_id, fabrica_id, criado_por)
SELECT (90000 + n)::text, (SELECT id FROM itens WHERE codigo = '900'), (SELECT id FROM fabricas WHERE nome = 'DEMO'),
       (SELECT ids[1 + n % 3] FROM demo_u)
FROM generate_series(1, 6) AS n;

CREATE TEMP TABLE demo_load AS
SELECT l.id, l.numero, CURRENT_DATE - (7 - (l.numero::int - 90000)) * 5 AS recebido
FROM loads l WHERE l.numero::int BETWEEN 90001 AND 90006 AND l.item_id = (SELECT id FROM itens WHERE codigo = '900');

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
WHERE l.recebido + a.dias < CURRENT_DATE;
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

-- TAB (10 dias) e Coliformes (2 dias) de cada composta, com o status pelo tempo; alguns positivos
INSERT INTO testes (tipo, composta_id, status, resultado, data_feito, feito_por, espalhar_prevista, espalhado_em, espalhado_por,
                    leitura_prevista, resultado_em, resultado_por)
SELECT x.tipo, c.id,
       CASE WHEN f + x.fim < CURRENT_DATE THEN 'Concluída'
            WHEN f + x.esp <= CURRENT_DATE THEN CASE x.tipo WHEN 'TAB' THEN 'Incubada' ELSE 'Estriada' END
            ELSE 'No caldo' END,
       CASE WHEN f + x.fim < CURRENT_DATE THEN CASE WHEN (c.id + length(x.tipo)) % 6 = 0 THEN 'Positivo' ELSE 'Negativo' END END,
       f, (SELECT ids[1 + (c.id % 3)::int] FROM demo_u),
       f + x.esp,
       CASE WHEN f + x.esp <= CURRENT_DATE THEN (f + x.esp) + time '09:00' END,
       CASE WHEN f + x.esp <= CURRENT_DATE THEN (SELECT ids[1 + ((c.id + 1) % 3)::int] FROM demo_u) END,
       CASE WHEN f + x.esp <= CURRENT_DATE THEN f + x.fim END,
       CASE WHEN f + x.fim < CURRENT_DATE THEN (f + x.fim) + time '14:00' END,
       CASE WHEN f + x.fim < CURRENT_DATE THEN (SELECT ids[1 + ((c.id + 2) % 3)::int] FROM demo_u) END
FROM (SELECT c.id, l.recebido + 1 AS f FROM compostas c JOIN demo_load l ON l.id = c.load_id) c
CROSS JOIN (VALUES ('TAB', 5, 10), ('COLIFORMES', 1, 2)) AS x(tipo, esp, fim);

COMMIT;
