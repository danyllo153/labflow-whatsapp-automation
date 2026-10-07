---
title: LabFlow LIMS — Banco e migrations
tags: [labflow, lims, spec, banco, postgres]
status: draft
version: v0.1
created: 2026-10-07
---

# Banco e migrations

**Navegação:** [Índice](index.md) · Anterior: [Revisão e liberação](04-revisao-e-liberacao.md) · Próximo: [API e autenticação](06-api-e-auth.md)

## Direção desta edição

O LIMS cresce **no mesmo banco** `labflow`, com migrations numeradas a partir da `015`, aplicadas uma de cada vez, testadas antes numa transação desfeita e com backup antes. O banco continua conferindo as regras (UNIQUE, CHECK, FK); o código dono de cada contexto decide e escreve.

## O que já existe

- 14 migrations, 19 tabelas, 12 views (inclusive o schema `bi` do Power BI).
- Usuários de banco: `labflow_app` (n8n) e `labflow_leitura` (DBeaver, Power BI).
- Datas em `America/Sao_Paulo`; `tanque` é TEXT; a coleta é o centro do NFC; no concentrado, recebimento → compostas → testes.

## Tabelas novas previstas (a detalhar)

| Tabela | Doc de origem |
|---|---|
| `auditoria` | [02](02-audit-trail.md) |
| `especificacoes` | [03](03-especificacoes.md) |
| Estado de revisão (coluna ou tabela) | [04](04-revisao-e-liberacao.md) |
| Senha/login dos usuários | [06](06-api-e-auth.md) |

## Perguntas a responder

- [ ] Um usuário de banco novo para a API (`labflow_api`) ou o mesmo `labflow_app`?
- [ ] Ferramenta de migration (`dbmate`, já no backlog) antes da `015`?
- [ ] Os dados de demonstração (`db/seeds/demo.sql`) ganham especificações e revisões fictícias?
