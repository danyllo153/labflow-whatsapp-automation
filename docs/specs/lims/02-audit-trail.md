---
title: LabFlow LIMS — Audit trail
tags: [labflow, lims, spec, banco]
status: draft
version: v0.2
created: 2026-10-07
updated: 2026-10-12
---

# Audit trail (histórico de alterações)

**Navegação:** [Índice](index.md) · Anterior: [Contextos e atores](01-contextos-e-atores.md) · Próximo: [Especificações](03-especificacoes.md)

> v0.2: transforma a proposta em requisitos testáveis, a partir do estudo de LIMS (`lims-estudo.md`) e dos princípios ALCOA+ / 21 CFR Part 11. Nada aqui é decisão aprovada ainda: o que está marcado **Recomendo** é sugestão para você aprovar ou trocar.

## Direção

Todo dado de laboratório alterado deixa rastro: **quem, quando, o quê, valor antigo e valor novo, e por quê**. O registro é feito **no banco, por trigger**, para valer em qualquer canal (WhatsApp, app, DBeaver). Ninguém, nem o Admin, edita ou apaga o histórico.

## Requisitos

| # | Requisito | Como verificar |
|---|---|---|
| A1 | Cada INSERT, UPDATE e DELETE nas tabelas auditadas gera uma linha em `auditoria` na **mesma transação** do dado | Teste de migration: alterar um registro e conferir a linha |
| A2 | A linha guarda: tabela, id do registro, operação, valor antigo e novo (JSON), usuário, instante (com fuso, segundo), canal (`whatsapp`, `app`, `banco`), motivo | Inspeção da tabela |
| A3 | `auditoria` é **só de acréscimo**: o usuário do app e o de leitura não têm UPDATE nem DELETE, e um trigger bloqueia ambos mesmo para o dono | Teste: tentar UPDATE/DELETE deve falhar |
| A4 | "Quem" vem de `SET LOCAL labflow.usuario_id`, preenchido pelo n8n e pela API em cada transação. Sem ele, a gravação é **recusada** (não grava anônimo) | Teste: gravar sem a variável deve falhar |
| A5 | Alteração de resultado exige **motivo** (texto obrigatório); o motivo vai para `auditoria.motivo` | Teste: UPDATE de resultado sem motivo falha |
| A6 | Só mudança real gera linha (valor igual ao anterior não polui) | Teste |
| A7 | Consulta do histórico de um registro por id, em ordem cronológica | View `vw_historico` |

## Proposta técnica

- Um único trigger genérico (`registrar_auditoria()`), ligado a cada tabela auditada. Valor antigo e novo com `to_jsonb(OLD)` e `to_jsonb(NEW)`.
- Campos que não entram no JSON (ruído): colunas de controle como `atualizado_em`.
- Índices em `(tabela, registro_id)` e em `(quando)`.
- Armazenamento previsto: poucos MB por mês neste volume; sem particionamento na v1.

## Quais tabelas

**Recomendo** a primeira versão cobrir **resultados e cadastros sensíveis**:
`contagens`, `testes`, `analises`, `drops`, `desvios_drop`, `usuarios` (cargo), e as novas `especificacoes` e `liberacoes`. Coletas, recebimentos e embarques entram na segunda rodada. (Nomes de tabela e de colunas a confirmar no schema atual antes da migration.)

## Retenção

**Recomendo** guardar a auditoria **enquanto o registro existir** (nunca apagar) e definir o prazo oficial com a qualidade/TI da empresa. A ISO/IEC 17025 pede retenção definida pelo laboratório.

## Fora do escopo (por ora)

- Assinatura eletrônica com validade jurídica (21 CFR Part 11 completo).
- Mostrar o histórico no app (entra com a Fase 3, para Admin e quem revisa).

## Perguntas ainda abertas

- [ ] Prazo oficial de retenção.
- [ ] O Consultor pode ver o histórico? (Recomendo: não.)
- [ ] Migrar os registros antigos para `auditoria`? (Recomendo: não; o histórico começa na data da migration, e isso fica escrito.)

## Pronto quando

A1 a A7 passam em teste automatizado de migration, e um UPDATE de C.T feito pelo WhatsApp aparece em `vw_historico` com quem, valor antigo, valor novo e motivo.
