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
| A | Spec do app revisada (07, 06, 08 e esta nota) | ⏳ em andamento (decisões de 15/10 tomadas; falta o 07) |
| B | API só de leitura + login | ⬜ |
| C | PWA só leitura: painel do dia, relatório do turno, gráficos | ⬜ |
| D | Chat embutido e registro pelo app | ⬜ |
| E | Decidir o futuro do WhatsApp | ⬜ |

## Decisões tomadas (15/10/2026)

As quatro decisões que estavam em aberto foram respondidas pelo Danyllo em 15/10/2026 (detalhe em [10](10-decisoes.md)):

- [x] **WhatsApp:** continua no ar enquanto o piloto está em teste. Desligar é objetivo futuro, decidido na Fase E.
- [x] **Relatório do turno:**
  - Turnos de **revezamento** nos 7 dias, editáveis pelo Admin: Manhã 08h–16h, Tarde 16h–00h, Madrugada 00h–08h. O turno que passa da meia-noite conta no dia em que começou.
  - As escalas fixas do ADM (ex.: 08h–17h, 15h–00h, sábado 08h–12h ou 14h–18h) **não** viram turno: a pessoa é marcada no turno com que coincide.
  - Cada registro entra no relatório pelo **turno** (sem mostrar a hora). Na troca de turno, vale o turno em que **quem registrou** está marcado como analista; sem marcação, vale o horário.
  - Campos: Data, Turno, **Analistas do turno** (marcados à mão por quem abre o relatório), Análises feitas e Análises pendentes (automáticos), Esterilizações realizadas e pendentes, Ocorrências do dia (texto livre).
  - Pendente = vence hoje e não feito, atrasados, desvios abertos e repetições, TAB/Coliformes em confirmação, C.T/B.L sem valor.
  - **Esterilização:** registro à mão (a autoclave não exporta dados), por botões **Ponteira, Meio, Frasco, Descarte** e texto livre; tabela própria do app. Pendente = tipo previsto para o turno e não marcado (a confirmar no 07).
- [x] **Ordem:** o app começa **lendo as tabelas atuais** do bot, sempre por views; não espera as migrations 021–026 do LIMS.
- [x] **Visual, offline e notificações:**
  - Visual no estilo dos LIMS comerciais (menu lateral e cartões no computador e no tablet; barra embaixo no celular), **paleta clara**: fundo creme, laranja claro, texto marrom-escuro, azul nos botões. **Sem nome, logotipo nem fotos da empresa** no repositório e no app de demonstração (aparece só "LabFlow").
  - **Só online**; primeiro só no servidor de demonstração.
  - **Sem notificação** no celular por enquanto. PWA **sem loja** (sem custo).

## Decisões em aberto (perguntar, não decidir sozinho)

- [ ] A hora das leituras de placa do NFC (`analises` não guarda) entra no turno pelo dia até a sessão do bot gravar a hora: pedido para a sessão do bot?
- [ ] Esterilização: há uma lista fixa de tipos por turno (para calcular o pendente) ou é sob demanda?
- [ ] Esterilização: guardar também o número do ciclo e "fita ok / não ok" (substitui a anotação no Word)?

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
- 15/10/2026: esterilização registrada pelo app (e um dia pelo WhatsApp: `esterilização feita de ponteiras`).
- 15/10/2026: integração direta com a autoclave ou com o computador (como o antigo registro automático), se um dia for possível.
- 15/10/2026: tablet como terceiro formato de tela (além de celular e computador).
- 15/10/2026: publicar o app nas lojas (Google Play ~US$ 25 uma vez; App Store ~US$ 99/ano), avaliar depois do piloto.
- 15/10/2026: controle de escala por pessoa (quem trabalha em qual dia), se o relatório do turno pedir.
- 15/10/2026: modo offline (gravar sem internet e enviar depois), avaliar depois.
