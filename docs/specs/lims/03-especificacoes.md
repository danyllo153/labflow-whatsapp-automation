---
title: LabFlow LIMS — Especificações
tags: [labflow, lims, spec, qualidade]
status: draft
version: v0.2
created: 2026-10-07
updated: 2026-10-12
---

# Especificações (limites por análise, item e cliente)

**Navegação:** [Índice](index.md) · Anterior: [Audit trail](02-audit-trail.md) · Próximo: [Revisão e liberação](04-revisao-e-liberacao.md)

> v0.2: define o modelo e a regra de escolha. Valores de limite **não** estão aqui: dependem de quem manda na empresa (perguntas abaixo). Os números hoje no código (B.L ≥ 50, C.T ≥ 200) só migram como especificação "geral" inicial.

## Direção

O que decide **ok / não ok** sai do código e vai para uma tabela de especificações no banco, **versionada e com vigência**. O mesmo cálculo serve ao relatório do WhatsApp, ao painel e ao app.

## Ponto de partida real (conferido na `main` em 13/10)

Já existem tabelas de limite com vigência: **`limites_nfc`** (migration 016: limites do NFC por análise) e **`limites_howard`** (017), e a Situação ok/não ok do NFC, dos drops e do Howard já sai delas (`vw_situacao_nfc`, `vw_relatorio_nfc`). O C.T/B.L do concentrado (B.L ≥ 50, C.T ≥ 200) e o TAB/Coliformes (positivo = não ok) ainda estão **fixos no código**. Então a `especificacoes` **não nasce do zero**: ela **unifica** `limites_nfc`, `limites_howard` e os limites fixos numa tabela só (com item e cliente), e as duas tabelas antigas viram *views* ou são migradas para ela. As migrations ficam em `023` (ver doc 05).

## Modelo

`especificacoes` (um limite por linha):

| Campo | Observação |
|---|---|
| `analise` | `CT`, `BL72`, `BL120`, `WORT`, `HOWARD`, `TAB`, `COLIFORMES`, `DROP`... |
| `item` | opcional (null = vale para qualquer item) |
| `cliente` | opcional (null = qualquer cliente). O que é "cliente": ver perguntas |
| `tipo_limite` | `maximo`, `minimo`, `faixa` ou `esperado` (ex.: TAB = negativo) |
| `limite_min`, `limite_max`, `esperado` | conforme o tipo |
| `unidade` | UFC/mL, %, etc. |
| `vigente_de`, `vigente_ate` | período em que vale; sem sobreposição para a mesma combinação |
| `aprovado_por`, `aprovado_em` | quem aprovou (Admin) |

## Regras

| # | Regra |
|---|---|
| E1 | A especificação aplicada é a **mais específica vigente na data da análise**: cliente+item > item > geral |
| E2 | Não pode haver duas vigentes para a mesma combinação (análise, item, cliente) no mesmo dia: o banco recusa |
| E3 | Mudar um limite = **criar uma linha nova** com vigência a partir de uma data. Nunca se edita a antiga |
| E4 | O resultado guarda **qual especificação foi usada** (`especificacao_id`) e o veredito (`ok` / `nao_ok`) no momento da avaliação. Mudar o limite depois **não** altera resultados antigos |
| E5 | Resultado com sinal `<` (abaixo do detectável): ok se o limite máximo for maior ou igual ao valor; `>` nunca é ok se houver limite máximo. Mantém a regra atual de que `<` nunca alarma |
| E6 | Sem especificação aplicável: o veredito é `sem_especificacao`, aparece no relatório e **não** vira ok por omissão |
| E7 | Só Admin cria especificação; a criação entra na `auditoria` |
| E8 | O alarme 🚨 do relatório passa a ser `nao_ok`, vindo desta tabela, em vez do `if` fixo |

## Migração dos limites atuais

Linhas iniciais, com `item` e `cliente` nulos e vigência a partir da data da migration: `BL72` e `BL120` máximo 50 (alarme ≥ 50: **confirmar se 50 é ok ou não ok**, pois o código alarma em ≥ 50 e um "máximo" é inclusivo), `CT` máximo 200 (mesma dúvida), `TAB` e `COLIFORMES` esperado negativo. Desvio de drop (7/13/25 °C) fica como está até a Fase 0 fechar.

## Perguntas ainda abertas (travam a v1.0)

- [ ] **Quem é o "cliente"**: o cliente final do suco, o destino do embarque, ou os dois?
- [ ] Os limites variam mesmo por item e por cliente hoje, ou existe um só por análise? (Se for um só, a v1 entrega só a tabela geral e deixa item/cliente prontos para o futuro.)
- [ ] Limites oficiais do Howard, do NFC (C.T, B.L, Psicrotróficos) e dos drops.
- [ ] O valor exatamente igual ao limite é ok ou não ok?
- [ ] Quem na empresa aprova uma especificação nova?

## Pronto quando

E1 a E8 passam em teste de migration; o relatório do dia e o painel leem `nao_ok` da tabela; trocar o limite do C.T numa data futura não muda o veredito de nenhum resultado antigo.
