---
title: LabFlow LIMS — Especificação (índice)
tags: [labflow, lims, spec]
status: draft
version: v0.1
created: 2026-10-07
---

# LabFlow LIMS — Especificação

> **Status:** planejamento (`v0.x` = rascunho em discussão; `v1.0` = aprovado, pode virar tarefa e código).
> **Quando começa:** depois da Fase 0 (fechar a v1.2.0 do LabFlow). Até lá, estes documentos só guardam o rumo para não nos perdermos.

Esta pasta é a **"semente"** do LIMS (Spec-Driven Development): primeiro decidimos o que e por quê, documento por documento; só com cada um aprovado (`v1.0`) ele vira tarefas pequenas, e cada tarefa cita de qual documento veio.

## Documentos

| # | Documento | Pergunta que responde |
|---|---|---|
| 00 | [Visão geral](00-visao-geral.md) | O que é o LIMS do LabFlow, para quem e o que muda |
| 01 | [Contextos e atores](01-contextos-e-atores.md) | Quem usa, com qual cargo, e quais partes do sistema existem |
| 02 | [Audit trail](02-audit-trail.md) | O que fica registrado quando um dado muda |
| 03 | [Especificações](03-especificacoes.md) | Quais limites valem para cada análise, item e cliente |
| 04 | [Revisão e liberação](04-revisao-e-liberacao.md) | Como um resultado passa de lançado a liberado |
| 05 | [Banco e migrations](05-banco-e-migrations.md) | Tabelas novas e como ligam com as atuais |
| 06 | [API e autenticação](06-api-e-auth.md) | Como o app conversa com o banco e como se faz login |
| 07 | [App (PWA)](07-app-pwa.md) | Quais telas existem e o que cada uma mostra |
| 08 | [Fluxos](08-fluxos.md) | O caminho de cada ação, pelo WhatsApp e pelo app |
| 09 | [Pontos de atenção](09-pontos-de-atencao.md) | LGPD, ISO/IEC 17025, segurança e riscos |
| 10 | [Decisões](10-decisoes.md) | O que já foi decidido e por quê |
| — | [Guia prático](guia-pratico.md) | Como semear estes docs, gerar tarefas e implementar |

## Ordem de trabalho

1. Revisar e aprovar **00, 01 e 10** (o "o quê" e o "quem").
2. Depois **02, 03 e 04** (o coração do LIMS: rastreabilidade, limites e liberação).
3. Depois **05** (banco) e **08** (fluxos), que dependem dos anteriores.
4. Por último **06 e 07** (API e app), que dependem de tudo.
5. **09** acompanha todos: cada documento novo passa pelos pontos de atenção.

## Ligado a

- Rumo do projeto: [`../../handoff.md`](../../handoff.md), seção 4
- Roadmap e comparativo com um LIMS completo: nota `Roadmap-V1-V6` do Obsidian
- Tarefas do dia a dia: nota `backlog` do Obsidian
