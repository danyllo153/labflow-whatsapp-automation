---
title: LabFlow LIMS — Guia prático
tags: [labflow, lims, spec, guia]
status: draft
version: v0.1
created: 2026-10-07
---

# Guia prático: da spec ao código

**Navegação:** [Índice](index.md) · Anterior: [Decisões](10-decisoes.md)

## O ciclo (semente → raízes → planta)

1. **Semear:** escolher um documento, responder as "Perguntas a responder" com o Claude, revisar. Subir a versão (`v0.1` → `v0.2`...).
2. **Aprovar:** quando o Danyllo aprovar, o documento vai para `status: approved` e `version: v1.0`, e a decisão entra em [10-decisoes](10-decisoes.md).
3. **Germinar:** o Claude lê só os documentos `v1.0` e gera as **tarefas** (raízes), pequenas e numeradas.
4. **Crescer:** cada tarefa vira uma branch, código, testes e PR, uma de cada vez.
5. **Revisar:** o que mudou na implementação volta para a spec (a spec nunca fica desatualizada).

## Regras para gerar tarefas (anti-alucinação)

- Usar **só** o que está escrito em documentos `v1.0`. Se faltar informação, **perguntar**, não inventar.
- Toda tarefa cita o documento e a seção de origem (ex.: `[03 §Proposta]`).
- Nada de tabela, coluna, rota ou regra que não esteja na spec.
- Cada tarefa cabe num PR pequeno e tem critério de pronto testável.
- Respeitar o `CLAUDE.md` (dados fictícios, backup antes de migration, permissão no código, push/PR/merge do Danyllo).

## Modelo de tarefa

```
LIMS-001 — <título curto>
Origem: 02-audit-trail.md §Proposta inicial
O quê: ...
Pronto quando: ... (teste ou verificação)
Fora: ...
```
