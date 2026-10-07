---
title: LabFlow LIMS — Pontos de atenção
tags: [labflow, lims, spec, lgpd, iso17025, seguranca]
status: draft
version: v0.1
created: 2026-10-07
---

# Pontos de atenção

**Navegação:** [Índice](index.md) · Anterior: [Fluxos](08-fluxos.md) · Próximo: [Decisões](10-decisoes.md)

## Direção desta edição

Todo documento desta pasta passa por esta lista antes de virar `v1.0`.

## LGPD e dados

- Dados **sempre fictícios** no repositório, nos testes, na documentação e no servidor de demonstração.
- Dado real só no ambiente da empresa, com a TI. Telefone e nome de usuário são dados pessoais.
- Exportações (CSV, Excel, PDF) saem do controle do banco: definir quem pode exportar.

## ISO/IEC 17025 (referência)

Requisitos que o LIMS ajuda a cumprir (conferir a redação na norma):

- Registros técnicos rastreáveis (quem fez, quando, com o quê).
- Controle de dados e gestão da informação: alteração rastreada, sem perder o valor original.
- Relato de resultados: resultado revisado antes de sair.
- Controle de registros: retenção e proteção definidas.

## Segurança

- Sem porta pública; acesso por túnel.
- Permissão no código e, quando possível, no banco; nunca no prompt da IA.
- Senhas só em hash; segredos só no `.env` do servidor; nada disso no Git.
- Backup antes de qualquer migration; cópia do backup fora do servidor (pendente).

## Riscos

- Duplicar regras entre o n8n e a API (mitigar: o app escreve pelo mesmo pipeline).
- Mudança de limite alterar o status de resultados antigos (mitigar: especificação com vigência).
- Excesso de escopo (mitigar: uma fase por vez, cada uma utilizável sozinha).
