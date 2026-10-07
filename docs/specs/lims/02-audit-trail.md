---
title: LabFlow LIMS — Audit trail
tags: [labflow, lims, spec, banco]
status: draft
version: v0.1
created: 2026-10-07
---

# Audit trail (histórico de alterações)

**Navegação:** [Índice](index.md) · Anterior: [Contextos e atores](01-contextos-e-atores.md) · Próximo: [Especificações](03-especificacoes.md)

## Direção desta edição

Todo dado de laboratório alterado deixa rastro: **quem, quando, o quê, valor antigo e valor novo**. O registro é feito **no banco, por triggers**, para valer qualquer que seja o canal (WhatsApp, app, DBeaver). Ninguém, nem o Admin, apaga ou edita o histórico.

## O que já existe

- Colunas "quem registrou" e "quem leu/concluiu" em várias tabelas, com data e hora.
- O banco recusa dado inválido (CHECK, FK), mas não guarda o valor anterior quando algo muda.

## Proposta inicial

- Tabela `auditoria` (só INSERT para o usuário do app): tabela, id do registro, operação (INSERT/UPDATE/DELETE), valor antigo e novo (JSON), quem, quando, canal.
- Trigger genérico nas tabelas de resultado (`contagens`, `testes`, `analises`, `drops`, `desvios_drop`) e de cadastro sensível (`usuarios`).
- "Quem" vem de uma variável da sessão (`SET LOCAL labflow.usuario_id`), preenchida pelo n8n e pela API em cada transação.

## Perguntas a responder

- [ ] Quais tabelas entram na primeira versão (só resultados ou tudo)?
- [ ] Por quanto tempo guardar o histórico? (ISO/IEC 17025 pede retenção definida pelo laboratório.)
- [ ] Correção de resultado exige motivo (texto obrigatório)?
- [ ] O histórico aparece no app? Para quem?

## Fora do escopo (por ora)

- Assinatura eletrônica com validade jurídica.
