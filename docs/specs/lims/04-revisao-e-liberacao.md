---
title: LabFlow LIMS — Revisão e liberação
tags: [labflow, lims, spec, qualidade]
status: draft
version: v0.1
created: 2026-10-07
---

# Revisão e liberação de resultados

**Navegação:** [Índice](index.md) · Anterior: [Especificações](03-especificacoes.md) · Próximo: [Banco e migrations](05-banco-e-migrations.md)

## Direção desta edição

Um resultado passa por **lançado → revisado → liberado**. Só resultado liberado vale para laudo e para decisão de lote. Quem libera é **outra pessoa**, diferente de quem lançou.

## O que já existe

- Resultados são gravados direto como finais; o "sim" do bot confirma a digitação, não revisa.
- `leitura do dia finalizada` fecha o dia de leitura, mas não é revisão.

## Proposta inicial

- Coluna de estado nas tabelas de resultado (ou tabela própria): `lancado`, `revisado`, `liberado`, `recusado` (com motivo).
- Comandos no WhatsApp (ex.: "revisar resultados de hoje") e tela no app com a fila de pendentes.
- Relatório diário marca o que ainda não foi liberado.

## Perguntas a responder

- [ ] Todo resultado precisa de revisão, ou só os não ok / fora de especificação?
- [ ] Revisão e liberação são duas etapas ou uma só?
- [ ] O que acontece com um resultado recusado: volta para o analista corrigir?
- [ ] Prazo para liberar? Alerta se ficar parado?
