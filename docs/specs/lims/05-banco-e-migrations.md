---
title: LabFlow LIMS — Banco e migrations (Fase 1)
tags: [labflow, lims, spec, banco, postgres]
status: draft
version: v0.2
created: 2026-10-07
updated: 2026-10-12
---

# Banco e migrations (Fase 1)

**Navegação:** [Índice](index.md) · Anterior: [Revisão e liberação](04-revisao-e-liberacao.md) · Próximo: [API e autenticação](06-api-e-auth.md)

> v0.2 (corrigido em 13/10): ordem e escopo das migrations da Fase 1. **Estado real:** a `main` já tem as migrations `001` a `020` (016 NFC placa a placa, 017 limites do Howard e Situação do relatório, 018 e 019 views do Power BI, 020 uso diário da IA). Por isso a Fase 1 começaria na `020`, mas a `020_uso_ia.sql` (limite diário da IA) ocupou o número, então a Fase 1 começa na **`021`**. Nomes de colunas das tabelas existentes ainda **a confirmar no schema** antes de cada migration.

## Princípios (herdados)

- Uma migration por vez, transacional, `-v ON_ERROR_STOP=1`, **backup antes**, e antes testada numa transação desfeita (`BEGIN ... ROLLBACK`).
- O banco confere as regras (UNIQUE, CHECK, FK, trigger); o código decide e escreve.
- Dados de demonstração fictícios; nada real.

## Ordem proposta

| Migration | Conteúdo | Doc |
|---|---|---|
| `021_auditoria.sql` | tabela `auditoria`, trigger `registrar_auditoria()`, bloqueio de UPDATE/DELETE, view `vw_historico`, variável `labflow.usuario_id` obrigatória | [02](02-audit-trail.md) |
| `022_auditoria_nas_tabelas.sql` | liga o trigger às tabelas de resultado e a `usuarios` | [02](02-audit-trail.md) |
| `023_especificacoes.sql` | tabela `especificacoes`, restrição de vigência sem sobreposição, linhas iniciais (limites atuais), função de escolha da mais específica | [03](03-especificacoes.md) |
| `024_resultado_estado.sql` | colunas de estado, `lancado_por`, `liberado_por`, `liberacao_automatica`, `substitui_id`, `especificacao_id`, `veredito`; CHECKs (R2, R5); regra de liberação automática do `ok` (sem estado "revisado" separado) | [04](04-revisao-e-liberacao.md) |
| `025_fora_de_especificacao.sql` | tabela do registro de fora de especificação | [04](04-revisao-e-liberacao.md) |
| `026_views_bi.sql` | atualiza as views do Power BI para ler só resultados vigentes e liberados | [04](04-revisao-e-liberacao.md) |

Cada uma entra num PR próprio, com testes antes de aplicar no servidor. A `022` depende da `021`; a `024` depende da `023`.

## Cuidados específicos

- **Resultados existentes:** a `024` os marca como `liberado` e `veredito` calculado pelas especificações iniciais, com a nota "migrado em <data>", para o painel não zerar. Isso vai para o texto da migration.
- **Compatibilidade do bot:** ligar o trigger de auditoria (`022`) **antes** de o n8n enviar `labflow.usuario_id` quebraria as gravações (regra A4). A ordem é: mudar o n8n (preenche a variável) → aplicar a `022`.
- **Power BI:** as views do schema `bi` mudam na `026`; avisar antes e conferir as 8 páginas.
- **Reversão:** cada migration tem o seu SQL de desfazer escrito junto (`NNN_desfazer.sql`), testado.
- **Usuário do banco:** `labflow_app` continua; ele **perde** UPDATE/DELETE em `auditoria`. A API (Fase 2) decide depois se ganha um usuário próprio.

## Ferramenta de migration

**Recomendo** adotar o `dbmate` **antes** da `021` (já está no backlog): registra o que foi aplicado e evita rodar duas vezes. Se preferir não, manter o procedimento manual atual.

## Perguntas ainda abertas

- [ ] `dbmate` antes da `021`?
- [ ] `db/seeds/demo.sql` ganha especificações e revisões fictícias? (Recomendo sim, para o painel e os testes.)

## Pronto quando

As migrations `021` a `026` aplicam, desfazem e reaplicam sem erro num banco de teste; os 208 testes do projeto e os do banco passam; o painel continua mostrando os mesmos números dos resultados migrados.
