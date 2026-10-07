---
title: LabFlow LIMS — Contextos e atores
tags: [labflow, lims, spec]
status: draft
version: v0.1
created: 2026-10-07
---

# Contextos e atores

**Navegação:** [Índice](index.md) · Anterior: [Visão geral](00-visao-geral.md) · Próximo: [Audit trail](02-audit-trail.md)

## Direção desta edição

Separar **quem** usa o sistema e **quais partes** ele tem, para que cada regra tenha um dono claro. Permissão é sempre conferida no código (e, quando der, de novo no banco), nunca no prompt da IA.

## Atores (hoje)

| Ator | Cargo atual | Pode hoje |
|---|---|---|
| Analista | Operador | Registrar coletas, leituras, resultados; consultar |
| Responsável | Admin | Tudo do Operador + trocar cargo de usuário |
| Visitante interno | Consultor | Só consultar |
| TI da empresa | — | Infraestrutura (fora do sistema) |

## Atores que o LIMS pode criar

- **Revisor:** confere e libera resultado lançado por outra pessoa. *Cargo novo ou papel do Admin?*
- **Gestor da qualidade:** cadastra e aprova especificações (limites).

## Contextos (partes do sistema)

| Contexto | O que é dono | Já existe? |
|---|---|---|
| NFC (tanques) | Coletas, drops, leituras, arquivo bag/pote, desvio de drop | Sim |
| Concentrado (FCOJ) | Loads, lotes, compostas, embarques, C.T/B.L, TAB, Coliformes, Howard | Sim |
| Usuários e acesso | Usuários, cargos, login | Parcial (sem senha) |
| Qualidade | Especificações, revisão/liberação, não conformidades | Não |
| Rastreabilidade | Audit trail | Parcial ("quem registrou/leu") |
| Relatórios | Relatório diário, painel, laudo PDF | Parcial |

## Perguntas a responder

- [ ] Revisor é cargo novo ou papel dentro do Admin?
- [ ] Uma pessoa pode revisar o próprio lançamento em algum caso (ex.: plantão com uma pessoa só)?
- [ ] Quem cadastra especificações: só o gestor da qualidade?
- [ ] O Consultor verá o app? Com quais telas?
