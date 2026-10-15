---
title: LabFlow LIMS — App (PWA)
tags: [labflow, lims, spec, app, pwa]
status: draft
version: v0.2
created: 2026-10-07
updated: 2026-10-15
---

# App web/mobile (PWA)

**Navegação:** [Índice](index.md) · Anterior: [API e autenticação](06-api-e-auth.md) · Próximo: [Fluxos](08-fluxos.md) · Bússola: [Rumo do app](rumo-do-app.md)

> v0.2 (15/10/2026): incorpora as decisões do Danyllo de 15/10 (registradas no [rumo do app](rumo-do-app.md) e em [10](10-decisoes.md)): relatório do turno, esterilização, permissões, gráficos e visual. O que está marcado **Recomendo** é sugestão para aprovar ou trocar. Nada aqui vira código antes da `v1.0`.

## Direção

Um app **instalável** no celular, no tablet e no computador (PWA: abre pelo navegador e vira ícone na tela inicial, **sem loja e sem custo**), sobre o **mesmo banco** do bot. Ele faz o que o bot faz, mostra o **dia** e o **turno** de forma visual, e no futuro tem um **chat embutido** que usa o mesmo caminho do bot (regex → IA → "sim").

**Regras que valem para todas as telas** (do rumo):
- O app **lê** as tabelas do bot, sempre por **views**; tabelas novas são só dele (schema `app`, migrations a partir da `030`).
- Gravação de dado de laboratório (coleta, leitura, resultado, desvio) **só pelo caminho do bot** (chat). O app grava direto apenas nas **próprias tabelas** (turno, relatório do turno, esterilização, pedidos ao Admin).
- Permissão conferida **no código da API** a cada chamada, pelo cargo; nunca no prompt da IA.
- **Só online.** Primeiro só no servidor de demonstração, com dados fictícios.
- Termos do bot: **drop**, **desvio**, **repetição** (nunca "reanálise"); TAB e Coliformes no masculino.

## Mapa das telas

```
Login ──► Entrar no turno ──► Início (o meu turno)
                                 ├── Relatório do turno   (página compartilhada do turno)
                                 ├── Esterilização        (botões + ciclo)
                                 ├── Consultas            (pendências, resultados, desvios, quem coletou)
                                 ├── Gráficos
                                 ├── Relatório do dia     (o mesmo do bot)
                                 ├── Chat                 [Fase D]
                                 └── Admin                [só Admin]
```

| Tela | Fase do rumo | Quem vê |
|---|---|---|
| Login, Entrar no turno, Início, Relatório do turno, Esterilização, Consultas, Gráficos, Relatório do dia | C | Conforme a tabela de permissões |
| Chat, atalhos de registro, foto e áudio | D | Admin, Operador; Coletor só com comandos de coleta |
| Admin | C | Admin |

## Telas

### 1. Login
Usuário e senha. O primeiro acesso e a recuperação de senha estão em [06](06-api-e-auth.md). Depois de entrar, o app pergunta o turno (tela 2) se a pessoa ainda não entrou em nenhum hoje.

### 2. Entrar no turno
- A pessoa escolhe **Manhã, Tarde ou Madrugada**. O app sugere o turno pelo horário atual.
- O **horário de entrada e de saída** vem preenchido com o padrão do turno e **a própria pessoa edita** (chegou atrasada, sai mais cedo, escala do ADM como 15h–00h).
- Tudo o que ela registrar **enquanto estiver no turno**, pelo app ou pelo WhatsApp (mesmo usuário), fica ligado a esse turno. Sem entrada no turno, vale o horário padrão.
- Botão **"Sair do turno"** registra a saída dela (seção "Encerramento").

### 3. Início (o meu turno)
O que a pessoa precisa ver ao chegar, sem digitar nada:
- **Cartões no topo** (números grandes, como nos LIMS comerciais): `Para hoje` · `Atrasados` · `Desvios abertos` · `Feito no turno`.
- **Pendências herdadas:** o que o turno anterior deixou (automático e escrito à mão), com quem encerrou e quando.
- **Lista "Para fazer agora"**, nos blocos do relatório do dia (FCOJ Recebimento, FCOJ Embarque, NFC Tank farm, NFC Navio), com barra de andamento por bloco (feito × previsto).
- Na Fase D, cada linha ganha o botão **"Registrar"**, que abre o chat com o comando pronto.

### 4. Relatório do turno (página compartilhada)
**Uma página por turno e por dia**, a mesma para todos do turno, atualizada para todos ao mesmo tempo (quem abre vê o que o colega acabou de escrever).

| Campo | Como é preenchido |
|---|---|
| **Data** | Automático. O turno da Madrugada conta no dia em que **começou** |
| **Turno** | Automático (Manhã, Tarde, Madrugada) |
| **Analistas do turno** | Quem entrou no turno pelo app, com o horário de entrada e de saída de cada um; editável à mão |
| **Análises feitas** | Automático, do banco: coletas, drops, leituras de NFC, C.T/B.L, TAB, Coliformes, Howard, recebimentos, embarques, desvios e repetições registrados no turno |
| **Análises pendentes** | Automático: o que vence hoje e não foi feito, atrasados, desvios abertos e repetições a ler, TAB/Coliformes em confirmação, C.T/B.L sem valor. Mais um campo **escrito à mão** para o que o sistema não sabe |
| **Esterilizações realizadas** | Automático, da tela de esterilização: tipo, ciclo, quem e quando (sem a hora na tela, só o turno) |
| **Esterilizações pendentes** | **Escrito à mão** (é sob demanda, não há rotina fixa) |
| **Ocorrências do dia** | Texto livre ("estufa 2 oscilou", "faltou meio X") |

**Como um registro cai no turno:** pela **hora** em que foi gravado e por **quem** gravou (a entrada no turno dessa pessoa). A tela mostra só o turno, nunca a hora (decisão de 15/10, para não criar conflito na troca de turno).

**Limitação até o pedido PB1 ser atendido:** a pré-leitura e a leitura final de C.T/B.L/WORT do NFC (`analises`) não guardam a hora. Até a sessão do bot acrescentar essa hora ([rumo, "Pedidos para a sessão do bot"](rumo-do-app.md)), essas leituras aparecem no relatório **do dia**, marcadas "turno não identificado".

#### Encerramento e passagem para o próximo turno
1. Cada pessoa toca em **"Sair do turno"** quando vai embora (registra a saída dela).
2. A **última pessoa** a sair confere a página e toca em **"Encerrar turno"**. O app pede confirmação mostrando o que vai passar adiante ("Ficam para a Tarde: 3 leituras, 1 desvio aberto, 2 recados").
3. As pendências (automáticas e escritas à mão) aparecem no **Início** e no relatório do **próximo turno**, como "herdadas da Manhã de 15/10".
4. Se ninguém encerrar, o turno **se encerra sozinho** quando o próximo começa, com o aviso "encerrado automaticamente".
5. Encerrado = **só leitura**. O Admin pode **reabrir** com motivo (fica registrado quem, quando e por quê).

Exportar o relatório do turno (PDF) ou mandá-lo no WhatsApp fica para depois.

### 5. Esterilização
- **Quatro botões grandes:** **Ponteira, Meio, Frasco, Descarte**, mais **"Outro"** com texto livre.
- Cada toque abre um passo só: **número do ciclo** (obrigatório) e, para Meio, o nome do meio opcional (ex.: PDA). Toca em "Registrar" e pronto: **uma tela, um toque de confirmação**, sem perguntas extras.
- Grava tipo, ciclo, quem e quando, numa tabela do app (`app.esterilizacoes`). **Não** grava o resultado da fita: o ok/não ok sai da nota da autoclave.
- A anotação no **Word continua** como rastreio oficial; o app só mostra no relatório do turno o que foi feito.
- Lista das esterilizações do turno embaixo dos botões, com "corrigir" (o próprio registro, no mesmo turno, com motivo).
- Futuro (Ideias do rumo): comando pelo WhatsApp (`esterilização feita de ponteiras ciclo 102`, pedido à sessão do bot) e ligação da análise ao ciclo usado.

### 6. Consultas
Leitura direta pelas views do banco, com filtro de data e busca:

| Consulta | Equivale no bot a |
|---|---|
| Pendências de um dia | drops de hoje, análises do dia, `quais ct tenho para ler hoje?` |
| Resultados de tanque, load ou navio | `resultado do tanque 41 do dia ...`, `quanto está o CT do load ...` |
| Quem coletou | `quem coletou o tanque 41 ...` |
| Desvios (drop e tanque) | `desvios do tanque 41 ...` |
| Compostas | busca de composta |
| Meus registros | (não existe no bot) |

### 7. Gráficos
Gráficos **operacionais e simples**; a análise completa continua no **Power BI** (o app não substitui o painel). Os números vêm das mesmas views `bi.*` do Power BI, para baterem.

**Recomendo** começar com quatro:

| # | Gráfico | Tipo | Para responder |
|---|---|---|---|
| G1 | **Feito × pendente por turno**, últimos 14 dias | Barras empilhadas (feito, pendente herdado) | "Os turnos estão fechando o que vence?" |
| G2 | **C.T e B.L por load**, ao longo do tempo, com a **linha do limite** | Pontos, 🚨 acima do limite em vermelho | "Algum load está subindo?" |
| G3 | **Desvios por semana** (drop e tanque) | Barras: abertos × fechados | "Os desvios estão sendo resolvidos?" |
| G4 | **Esterilizações por tipo e turno**, semana | Barras agrupadas | "Onde se esteriliza mais?" |

Regras: filtro de período (7, 14, 30 dias); toque/clique numa barra mostra a lista por trás; a mesma cor para a mesma coisa em todos os gráficos; sem gráfico "por pessoa" (pode soar como vigilância; se um dia for preciso, só para Admin).

### 8. Relatório do dia
O mesmo texto do `relatório do dia` do bot. **Recomendo** pedir ao bot (pelo caminho do chat, Fase D) para o texto ser idêntico, sem copiar a lógica; até lá, montar a partir das views `vw_relatorio_nfc` e das previstas, com o aviso "versão do app".

### 9. Chat (Fase D)
- Conversa igual ao WhatsApp, com os **mesmos comandos e respostas** (mesmo caminho do bot; desenho técnico em [06](06-api-e-auth.md) e [08](08-fluxos.md)).
- Quando o bot pede confirmação, **"Sim" e "Não" viram botões**. Vale a regra do bot: **uma mensagem e um "sim"** para a lista inteira; a confirmação explica o que será criado.
- Atalhos de registro: formulários curtos que **só montam o texto do comando** e o mandam pelo chat (a regra continua no bot).
- Foto de laudo e áudio: botões de câmera e microfone, mesmo fluxo do bot ([foto-laudo](../foto-laudo.md)).

### 10. Admin
Usuários (nome, cargo), convite de primeiro acesso, zerar senha, bloquear acesso ao app, **horários padrão dos turnos**, **pedidos de exclusão** dos Operadores (aprovar ou recusar), reabrir turno encerrado. Trocar cargo continua pelo bot enquanto o cargo morar em `usuarios` (tabela do bot).

## Permissões (decididas em 15/10)

O **Operador é o analista em geral**.

| Ação | Admin | Operador | Consultor | Coletor (futuro) |
|---|---|---|---|---|
| Ver Início, consultas, gráficos e relatórios | ✅ | ✅ | ✅ | Só as próprias coletas e as pendências de coleta |
| Entrar no turno e editar o próprio horário | ✅ | ✅ | ❌ | ✅ |
| Encerrar o turno | ✅ | ✅ | ❌ | ❌ |
| Registrar coletas | ✅ | ✅ | ❌ | ✅ |
| Registrar análises, resultados, desvios e esterilização | ✅ | ✅ | ❌ | ❌ |
| Corrigir registro (com motivo) | ✅ | ✅ | ❌ | Só a própria coleta, no mesmo dia |
| Excluir registro (com motivo e confirmação; fica no histórico) | ✅ | ✅ | ❌ | Pede ao Admin |
| Adicionar pessoa, convite, senha, trocar cargo | ✅ | ❌ | ❌ | ❌ |
| Editar horários padrão dos turnos, reabrir turno | ✅ | ❌ | ❌ | ❌ |

O cargo **Coletor** depende do pedido PB2 à sessão do bot (o cargo mora em `usuarios`).

## Visual (decidido em 15/10)

- **Estilo:** o dos LIMS comerciais. No **computador e no tablet**: menu na lateral, cartões com números grandes no topo, listas com barra de andamento e etapas. No **celular**: barra de botões embaixo (**Início · Turno · Esterilização · Consultas · Gráficos**) e cartões empilhados.
- **Três tamanhos** desde o começo: celular, tablet e computador.
- **Paleta clara** (laranja claro e creme). Ponto de partida, a ajustar na tela:

  | Uso | Cor |
  |---|---|
  | Fundo | creme `#FBF6E9` |
  | Cartões | branco `#FFFFFF` com borda `#EADFC4` |
  | Principal (barra, destaques) | laranja claro `#F6B04A` |
  | Texto | marrom-escuro `#4A3418` |
  | Botões de ação | azul `#2F7BC4` |
  | Ok · Não ok · Atenção | verde `#2E8B57` · vermelho `#C0392B` · âmbar `#E0A100` |

  O ok/não ok **nunca só pela cor**: sempre com ✅, 🚨 ou o texto.
- **Sem nome, logotipo ou fotos da empresa** no repositório e no app de demonstração: o app aparece só como **"LabFlow"**.

## Tabelas do app (schema `app`, a partir da 030)

Só o que estas telas pedem; nomes a confirmar na migration. Nenhuma altera tabela do bot (só referenciam `usuarios(id)`).

| Tabela | Para quê |
|---|---|
| `app.turnos` | Manhã, Tarde, Madrugada com o horário padrão (editável pelo Admin) |
| `app.entradas_turno` | Quem entrou em qual turno e dia, com entrada e saída editadas pela pessoa |
| `app.relatorios_turno` | Uma linha por turno e dia: pendências escritas à mão, esterilizações pendentes, ocorrências, encerrado por/em, automático sim/não, reaberto por/em/motivo |
| `app.esterilizacoes` | Tipo, ciclo, meio (opcional), quem, quando |
| `app.pedidos_exclusao` | Pedido do Operador ao Admin: o que, motivo, decisão |

Login (`app.credenciais`, convites, sessões) fica em [06](06-api-e-auth.md).

## Fora do escopo (por ora)

Notificação no celular, modo offline, loja de aplicativos, PDF do relatório do turno, enviar o relatório pelo WhatsApp, formulários com regra própria na API, gráfico por pessoa. (Ideias registradas no [rumo](rumo-do-app.md).)

## Perguntas ainda abertas

- [ ] **Pedido de exclusão aprovado:** como a exclusão acontece de fato, se o registro está numa tabela do bot? **Recomendo:** o Admin aprova no app e o app mostra o comando pronto para o Admin mandar pelo chat/bot (a exclusão continua no caminho do bot; com o LIMS, vira "invalidar" com motivo, doc [04](04-revisao-e-liberacao.md)). Precisa de comando de exclusão no bot (pedido à sessão do bot).
- [ ] **Gráficos:** começar com G1 a G4?
- [ ] **Paleta:** os códigos de cor acima servem como ponto de partida?
- [ ] **Relatório do dia** antes da Fase D: montar a partir das views (com aviso "versão do app") ou esperar o chat?
- [ ] **Ciclo obrigatório** na esterilização (como está acima) ou opcional?

## Pronto quando

As perguntas acima estão respondidas, o [06](06-api-e-auth.md) e o [08](08-fluxos.md) estão revisados no mesmo nível, e o Danyllo aprova: o documento vai a `status: approved`, `version: v1.0`, e só então as telas viram tarefas (`APP-001`...), cada uma citando a seção de origem.
