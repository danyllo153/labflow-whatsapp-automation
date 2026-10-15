---
title: LabFlow LIMS — Rumo do app (bússola)
tags: [labflow, lims, spec, app, rumo]
status: ativo
created: 2026-10-15
---

# Rumo do app (bússola)

**Navegação:** [Índice](index.md) · [App (PWA)](07-app-pwa.md) · [Decisões](10-decisoes.md)

> Leia esta nota **antes de cada tarefa do app** e de novo sempre que estiver em dúvida sobre o que fazer. Se uma tarefa não aparece aqui nem foi pedida pelo Danyllo, **pare e pergunte**. Esta nota fica igual no repositório (`docs/specs/lims/rumo-do-app.md`) e no Obsidian (`05-Specs-LIMS/rumo-do-app.md`).

## Para onde vamos

Um app **web + celular** (PWA, instalável sem loja) sobre o **mesmo banco** do bot, com:
1. as mesmas funções do bot do WhatsApp (registros, resultados, consultas, desvios, foto de laudo);
2. **gráficos** e um **relatório do turno**: o que foi feito e o que fica pendente para o próximo turno;
3. um **chat embutido** que usa o mesmo caminho do bot (regex → IA → "sim").

A base já está escrita nas specs do LIMS ([00](00-visao-geral.md) a [10](10-decisoes.md)): **evoluir esses documentos, não começar outro**.

## Fase atual

**Fase A: especificação.** Nada de código até o Danyllo aprovar.

| Fase | O que entrega | Situação |
|---|---|---|
| A | Spec do app revisada (07, 06, 08 e esta nota) | ⏳ em andamento |
| B | API só de leitura + login | ⬜ |
| C | PWA só leitura: painel do dia, relatório do turno, gráficos | ⬜ |
| D | Chat embutido e registro pelo app | ⬜ |
| E | Decidir o futuro do WhatsApp | ⬜ |

## Decisões em aberto (perguntar, não decidir sozinho)

- [ ] **WhatsApp:** em 07/10 ficou decidido que o WhatsApp **continua** como canal ([10](10-decisoes.md)); em 15/10 o Danyllo falou em o chat do app **substituir** o bot. Qual vale?
- [ ] **Relatório do turno:** quais turnos existem, e o que conta como "pendente para o próximo turno"?
- [ ] **Ordem:** o app espera a base do LIMS no banco (migrations 021 a 026) ou começa só lendo as tabelas atuais?
- [ ] Perguntas do [07](07-app-pwa.md): visual escuro, offline, notificações.

## Regras que não mudam

- O app **lê** as tabelas do bot; tabelas novas são só dele. Migrations do app **a partir da 030** (021–026 são do LIMS, 027 é do Recebimento NFC).
- Não mexer em `LabFlow.json`, `LabFlow_Alerta_Erro.json`, migrations existentes nem `docs/comandos.md`: isso é da sessão do bot.
- Permissão validada no código (Operador/Admin), nunca no prompt da IA.
- Dados sempre fictícios; nunca IP, chave, telefone ou ID real no repositório.

## Sinais de que se perdeu

- Está escrevendo código antes da spec aprovada.
- Criou um documento novo em vez de evoluir o `07-app-pwa.md` e os vizinhos.
- Está mudando algo do bot do WhatsApp.
- Decidiu sozinho uma das "decisões em aberto".

## Ideias do Danyllo (anotar aqui, decidir depois)

- 15/10/2026: relatório do turno com o que foi feito e o que fica para o próximo turno.
- 15/10/2026: chat embutido que no futuro substitui o bot do WhatsApp.
