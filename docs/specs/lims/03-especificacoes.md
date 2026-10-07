---
title: LabFlow LIMS — Especificações
tags: [labflow, lims, spec, qualidade]
status: draft
version: v0.1
created: 2026-10-07
---

# Especificações (limites por análise, item e cliente)

**Navegação:** [Índice](index.md) · Anterior: [Audit trail](02-audit-trail.md) · Próximo: [Revisão e liberação](04-revisao-e-liberacao.md)

## Direção desta edição

Os limites que decidem **ok / não ok** saem do código e vão para uma **tabela de especificações** no banco, versionada e com vigência. O mesmo cálculo serve ao relatório do WhatsApp, ao painel e ao app.

## O que já existe

- Limites fixos no código: B.L ≥ 50 e C.T ≥ 200 geram alarme; TAB/Coliformes positivo = não ok.
- A Situação ok/não ok das demais linhas (Howard, NFC, drops) **ainda não foi definida** (Fase 0).

## Proposta inicial

- Tabela `especificacoes`: análise, item (opcional), cliente (opcional), limite mínimo/máximo ou resultado esperado, unidade, vigência (de/até), quem aprovou.
- Regra de escolha: a especificação **mais específica** vigente (cliente + item > item > geral).
- **Ponte com a Fase 0:** a Situação do relatório já nasce lendo uma tabela simples (análise → limite), que esta especificação só amplia.

## Perguntas a responder

- [ ] Limites oficiais do Howard e do NFC (C.T, B.L, Psicrotróficos) e regra dos drops.
- [ ] O limite muda por cliente? Por item? Por destino do embarque?
- [ ] Resultado "<10" (abaixo do detectável) conta como ok sempre?
- [ ] Quem aprova uma especificação nova, e o que acontece com resultados antigos quando o limite muda?
