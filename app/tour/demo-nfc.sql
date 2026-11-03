-- Dados FICTÍCIOS só para os vídeos do tour: Recebimento NFC (item 129, amostra Fresh) em duas fábricas,
-- para o gráfico de tendência ter o que mostrar. Vai só no banco de TESTE do GitHub Actions; nunca em produção.
-- Datas relativas a hoje (as últimas ~6 semanas), C.T 48h, B.L 72h e B.L 120h, com a diluição aplicada.
DO $$
DECLARE
  f text; i int; v_item bigint; v_fab bigint; v_load bigint; v_rec bigint; v_dil int; v_dt date; v_lido numeric;
BEGIN
  INSERT INTO itens (codigo) VALUES ('129')
    ON CONFLICT (codigo) DO UPDATE SET codigo = EXCLUDED.codigo RETURNING id INTO v_item;
  FOREACH f IN ARRAY ARRAY['CON', 'TMG'] LOOP
    INSERT INTO fabricas (nome) VALUES (f)
      ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id INTO v_fab;
    FOR i IN 1..12 LOOP
      v_dt := current_date - (7 + (i - 1) * 3 + CASE WHEN f = 'TMG' THEN 1 ELSE 0 END);
      INSERT INTO loads (numero, item_id, fabrica_id)
        VALUES ((CASE WHEN f = 'CON' THEN 88000 ELSE 89000 END + i)::text, v_item, v_fab)
        ON CONFLICT (numero, item_id) DO UPDATE SET numero = EXCLUDED.numero RETURNING id INTO v_load;
      v_dil := 2;
      INSERT INTO recebimento_nfc (load_id, lote, amostra, diluicao, data_recebimento)
        VALUES (v_load, 1, 'fresh', v_dil, v_dt) RETURNING id INTO v_rec;
      -- C.T 48h: CON mais baixo e estável, TMG mais alto e com picos
      v_lido := CASE WHEN f = 'CON' THEN 6 + (i * 5) % 7 ELSE 11 + (i * 7) % 13 END;
      INSERT INTO contagens_nfc (analise, recebimento_nfc_id, sinal, valor, valor_lido, diluicao, lido_em)
        VALUES ('CT', v_rec, '=', v_lido * power(10, v_dil), v_lido, v_dil, (v_dt + 2)::timestamp + interval '10 hours');
      v_lido := CASE WHEN f = 'CON' THEN 3 + (i * 3) % 5 ELSE 6 + (i * 5) % 9 END;
      INSERT INTO contagens_nfc (analise, recebimento_nfc_id, sinal, valor, valor_lido, diluicao, lido_em)
        VALUES ('BL72', v_rec, '=', v_lido * power(10, v_dil), v_lido, v_dil, (v_dt + 3)::timestamp + interval '10 hours');
      v_lido := CASE WHEN f = 'CON' THEN 4 + (i * 2) % 6 ELSE 8 + (i * 3) % 10 END;
      INSERT INTO contagens_nfc (analise, recebimento_nfc_id, sinal, valor, valor_lido, diluicao, lido_em)
        VALUES ('BL120', v_rec, '=', v_lido * power(10, v_dil), v_lido, v_dil, (v_dt + 5)::timestamp + interval '10 hours');
    END LOOP;
  END LOOP;
END $$;
