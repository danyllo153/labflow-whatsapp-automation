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
  - Cada registro entra no relatório pelo **turno** (sem mostrar a hora). **Cada pessoa entra no turno pelo próprio app** ("sou da Tarde, 16h–00h", horário editável à mão ao entrar); tudo o que ela registrar enquanto estiver no turno (pelo app ou pelo WhatsApp, pelo mesmo usuário) fica ligado a esse turno. Sem entrada no turno, vale o horário.
  - Campos: Data, Turno, **Analistas do turno** (quem entrou no turno pelo app; editável à mão), Análises feitas e Análises pendentes (automáticos), Esterilizações realizadas e pendentes, Ocorrências do dia (texto livre).
  - **Página do relatório compartilhada** e sincronizada para todos do turno. Ao sair, a pessoa atualiza e **encerra o turno**; tudo o que ficou pendente (automático e escrito à mão) **passa para o relatório do próximo turno**.
  - **Encerramento:** cada pessoa registra a própria saída; o turno se encerra quando **a última pessoa sai** e toca em "Encerrar turno"; se ninguém encerrar, ele se **encerra sozinho** quando o próximo turno começa (aviso "encerrado automaticamente"). Encerrado = só leitura; o Admin reabre com motivo.
  - Pendente = vence hoje e não feito, atrasados, desvios abertos e repetições, TAB/Coliformes em confirmação, C.T/B.L sem valor.
  - **Esterilização:** registro à mão (a autoclave não exporta dados), por botões **Ponteira, Meio, Frasco, Descarte** e texto livre, **com o número do ciclo** (ex.: "meio de cultura, ciclo 100"; "ponteira, ciclo 102"); tabela própria do app. **Sem resultado da fita**: o ok/não ok sai da nota da autoclave. A anotação no **Word continua** (é o rastreio oficial da empresa); o app só ajuda a saber o que foi feito e o que falta no turno. É **sob demanda** (sem rotina fixa): "Esterilizações pendentes" é um **campo escrito à mão**, sem cálculo automático.
- [x] **Ordem:** o app começa **lendo as tabelas atuais** do bot, sempre por views; não espera as migrations 021–026 do LIMS.
- [x] **Visual, offline e notificações:**
  - Visual no estilo dos LIMS comerciais (menu lateral e cartões no computador e no tablet; barra embaixo no celular), **paleta clara**: fundo creme, laranja claro, texto marrom-escuro, azul nos botões. **Sem nome, logotipo nem fotos da empresa** no repositório e no app de demonstração (aparece só "LabFlow").
  - **Só online**; primeiro só no servidor de demonstração.
  - **Sem notificação** no celular por enquanto. PWA **sem loja** (sem custo).

- [x] **Permissões por cargo no app** (15/10/2026). O **Operador é o analista em geral**. Detalhe vai para o [07](07-app-pwa.md):

  | Ação | Admin | Operador | Consultor | Coletor (futuro) |
  |---|---|---|---|---|
  | Ver painel, consultas, gráficos e relatórios | ✅ | ✅ | ✅ | Só as próprias coletas e pendências de coleta |
  | Entrar no turno e **editar o próprio horário de entrada/saída** (atraso, saída antecipada) | ✅ | ✅ | ❌ | ✅ |
  | Encerrar o turno | ✅ | ✅ | ❌ | ❌ |
  | Registrar coletas | ✅ | ✅ | ❌ | ✅ |
  | Registrar análises, resultados, desvios e esterilização | ✅ | ✅ | ❌ | ❌ |
  | Corrigir registro (com motivo) | ✅ | ✅ | ❌ | Só a própria coleta, no mesmo dia |
  | Excluir registro (com motivo e confirmação; fica no histórico) | ✅ | ✅ (mudado em 15/10, à noite) | ❌ | Pede ao Admin |
  | Adicionar pessoa, convite, senha, trocar cargo | ✅ | ❌ | ❌ | ❌ |
  | Editar os horários padrão dos turnos | ✅ | ❌ | ❌ | ❌ |

## Decisões em aberto (perguntar, não decidir sozinho)

_(nenhuma no momento; as novas dúvidas da revisão do 07 ficam no próprio 07)_

## Pedidos para a sessão do bot

O app não mexe nas tabelas nem no workflow do bot: o que ele precisa vira pedido aqui, e a sessão do bot decide como e quando fazer.

| # | Pedido | Por quê | Situação |
|---|---|---|---|
| PB1 | **Toda leitura, análise e registro com a hora** em que foi feito. Hoje falta em `analises`: a pré-leitura e a leitura final guardam só quem (`pre_leitura_por`, `leitura_final_por`), sem a hora. Sugestão: colunas `pre_leitura_em` e `leitura_final_em` numa migration do bot (028/029), preenchidas pelo workflow | O relatório do turno precisa saber em qual turno cada coisa foi feita (rastreio) | Pedido em 15/10/2026, autorizado pelo Danyllo |
| PB2 | Cargo **Coletor** (só registra coletas) na tabela `usuarios` e nas permissões do bot | Novo perfil previsto; o bot e o app precisam do mesmo cargo | **Atendido** pela sessão do bot (migration `029_cargo_coletor`, 15/10/2026): Coletor registra coleta e corrige/apaga a própria coleta |
| PB4 | **Funções do banco para editar e excluir** (ex.: `excluir_coleta(id, quem, motivo)`, `corrigir_recebimento(...)`), usadas pelo app e pelo bot; começar por **Coletas** e **Recebimento**. Excluir **guarda** o registro como excluído (não apaga de vez) | Decisão de 15/10 (opção A): a regra mora num lugar só | Pedido em 15/10/2026; desenho detalhado no [08](08-fluxos.md) |
| PB5 | **Funções do banco para cadastrar pessoa e trocar cargo** (`cadastrar_usuario(nome, telefone, cargo, quem)`, `trocar_cargo(...)`), usadas pelo app (tela "Nova pessoa") e pelo bot (`adicionar cargo de ...`) | O app sai com a tela de adicionar pessoa já na primeira versão (decisão de 15/10) | Pedido em 15/10/2026; **precisa estar pronto antes do lançamento do app** |
| PB6 | **Assistente do app pelo mesmo workflow do bot:** aceitar no webhook `labflow-registro` mensagens com `canal: app` (mesmo formato da Evolution, telefone da pessoa logada, segredo no cabeçalho); quando o canal for `app`, os nodes de resposta (hoje `Zap · ...`, que chamam `sendText` da Evolution) e o download de mídia (`getBase64...`) passam a usar a **API do app** em vez da Evolution. O WhatsApp continua idêntico. Acrescentar casos em `tests/` | O assistente usa o mesmo cérebro do bot, sem duplicar regras ([08](08-fluxos.md), A4) | Pedido em 15/10/2026, autorizado pelo Danyllo; necessário só na Fase D |


## Regras que não mudam

- O app **lê** as tabelas do bot **por views** e **grava nelas só por funções do banco aprovadas** (ex.: `excluir_coleta(id, quem, motivo)`), as mesmas que o bot passa a usar: a regra mora num lugar só (decisão de 15/10). Tabelas novas são só dele. Migrations do app **a partir da 030** (021–026 são do LIMS, 027 é do Recebimento NFC).
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
- 15/10/2026: ligar as análises do dia aos ciclos de esterilização usados (ex.: "recebimento analisado com PDA do ciclo 102 e ponteiras do ciclo 103"), para rastreio.
- 15/10/2026: com o RAG, preencher alguns laudos automaticamente, usando os ciclos registrados.
- 15/10/2026: **o app é o LIMS e a "cara" do sistema**, como o Power BI é hoje: telas bonitas, interativas e fáceis para leigos, no estilo do LabWare e do QBench. O bot vira um **assistente de IA** dentro do app (botão para falar ou escrever "coletei tal coisa"), em vez de ser o jeito principal de registrar.
- 15/10/2026: **todas as páginas do Power BI também no app** (Visão geral, Coletas, Tanques, Drops, Desvios, Recebimento, Embarque, TAB e Coliformes, Recebimento NFC), mais uma página por **navio** (coletado, analisado, pendente).
- 15/10/2026: em toda página com lista, **filtrar** (load, lote, tanque, usuário, data...) e **imprimir só o que foi filtrado**, como no Excel; também exportar.
- 15/10/2026: depois de registrar pelo assistente, o registro aparece na hora na página correspondente, com o nome de quem fez.
- 15/10/2026: caixa de marcar **"Feito"** ao lado de cada pendência herdada do turno anterior.
- 15/10/2026: **"Para fazer agora" = atividades fixas de cada turno** (lista a ser passada pelo Danyllo), com check de feito.
- 15/10/2026: telas e listas mais **compactas** (a prévia ficou grande).
- 15/10/2026: **temperatura das estufas** por turno, falada ou digitada, gravada com hora e turno (número de estufas a ser passado pelo Danyllo).
- 15/10/2026: telefone opcional para quem usa só o app (hoje `usuarios` exige telefone), avaliar na Fase E.
- 15/10/2026: senha provisória mandada pelo próprio bot (`acesso ao app`), quando houver mais gente.
- 15/10/2026: recuperação de senha por e-mail (exige cadastrar o e-mail de cada pessoa e um serviço de envio), avaliar depois do piloto.
