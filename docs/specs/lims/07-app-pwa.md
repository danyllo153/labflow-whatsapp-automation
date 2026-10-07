---
title: LabFlow LIMS — App (PWA)
tags: [labflow, lims, spec, app, pwa]
status: draft
version: v0.1
created: 2026-10-07
---

# App web/mobile (PWA)

**Navegação:** [Índice](index.md) · Anterior: [API e autenticação](06-api-e-auth.md) · Próximo: [Fluxos](08-fluxos.md)

## Direção desta edição

Um app **instalável no celular** (PWA), feito em React + Vite, começando **só leitura**. O registro pelo app vem depois e usa o **mesmo pipeline** do WhatsApp (regex → IA → "sim"), sem duplicar regras.

## Telas da primeira versão (só leitura)

1. Login
2. Meus registros (coletas e resultados que lancei)
3. Minhas últimas análises
4. Painel do dia (o que vence hoje, atrasados)
5. Relatório do dia

## Depois (escrita)

- Chat embutido que manda o texto ao mesmo fluxo do bot.
- Formulários com botões, movendo as regras dos Code nodes para a API aos poucos.
- Fila de revisão e liberação ([04](04-revisao-e-liberacao.md)).

## Perguntas a responder

- [ ] Visual: seguir o modo escuro do painel do Power BI?
- [ ] Funciona sem internet (offline) em alguma tela?
- [ ] Notificações no celular (prazo vencendo) ou só pelo WhatsApp?
