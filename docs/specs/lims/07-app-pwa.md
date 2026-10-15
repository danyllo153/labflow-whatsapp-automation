---
title: LabFlow LIMS — App (PWA)
tags: [labflow, lims, spec, app, pwa]
status: draft
version: v0.3
created: 2026-10-07
updated: 2026-10-15
---

# App web/mobile (PWA): a cara do LIMS

**Navegação:** [Índice](index.md) · Anterior: [API e autenticação](06-api-e-auth.md) · Próximo: [Fluxos](08-fluxos.md) · Bússola: [Rumo do app](rumo-do-app.md)

> v0.3 (15/10/2026, noite): o app passa a ser **o LIMS**, a "cara" do sistema (como o Power BI é hoje), e o bot vira um **assistente de IA** dentro dele. Incorpora as decisões de 15/10 registradas no [rumo](rumo-do-app.md) e em [10](10-decisoes.md). O que está marcado **Recomendo** é sugestão para aprovar ou trocar. Nada aqui vira código antes da `v1.0`.

## Direção

Um app **instalável** no celular, no tablet e no computador (PWA: abre pelo navegador e vira ícone na tela inicial, **sem loja e sem custo**), sobre o **mesmo banco** do bot. Ele é **bonito, interativo e fácil para quem não é de informática**, no estilo dos LIMS comerciais (LabWare, QBench):

1. **Páginas como as do Power BI**, com filtro, impressão e exportação, onde se **vê e se mexe** nos dados.
2. **A minha lista do dia** e o **relatório do turno**, logo na entrada.
3. Um **assistente de IA** sempre à mão (texto, voz e foto), que faz o que o bot faz hoje, sem a pessoa precisar decorar comandos.

O WhatsApp continua no ar durante o piloto (decisão de 15/10); o app tende a ser o canal principal.

## Regras que valem para todas as telas

- **Leitura** das tabelas do bot **sempre por views**.
- **Gravação nas tabelas do bot só por funções do banco aprovadas** (decisão de 15/10, opção A): cada ação (criar, corrigir, excluir) é uma função no PostgreSQL, por exemplo `excluir_coleta(id, quem, motivo)` ou `corrigir_recebimento(id, campos, quem, motivo)`. O **app e o bot usam as mesmas funções**, então a regra mora num lugar só. As funções são criadas **com a sessão do bot** (pedido PB4 no rumo).
- **Tabelas próprias do app** (turno, relatório do turno, esterilização) no schema `app`, migrations a partir da `030`.
- **Tudo que grava mostra o que vai mudar e pede uma confirmação**, como o "sim" do bot: "antes → depois" na correção; a lista inteira na foto (**um sim** para a lista toda).
- **Excluir e corrigir pedem motivo** e ficam no histórico (com o LIMS, o histórico é o da [auditoria](02-audit-trail.md)).
- Permissão conferida **no código da API** a cada chamada, pelo cargo; nunca no prompt da IA.
- **Só online.** Primeiro só no servidor de demonstração, com dados fictícios.
- Termos do bot: **drop**, **desvio**, **repetição** (nunca "reanálise"); TAB e Coliformes no masculino.

## Três jeitos de fazer qualquer coisa

Toda ação pode ser feita do jeito mais fácil na hora; os três terminam na **mesma função do banco**:

| Jeito | Exemplo | O que a pessoa vê antes de gravar |
|---|---|---|
| **Clicar** | Página Recebimento → toca na linha → **Editar** → formulário já preenchido → muda o lote → **Salvar** | "Lote 4 → 40. Motivo: ____. Confirmar?" |
| **Falar ou escrever** (assistente) | Na mesma linha, **"Corrigir com o assistente"** → "o lote 4 era 40". O assistente já sabe de qual registro se trata | O mesmo "antes → depois" e um **sim** |
| **Foto** | Câmera → foto do laudo de leituras | A lista do que foi lido, com o que ficou em dúvida, e **um sim** para tudo |

**Atualização ao vivo:** quando alguém grava (por clique, assistente, foto ou WhatsApp), as páginas abertas se atualizam sozinhas para todo mundo, sem recarregar. O registro aparece com **o nome de quem fez**.

## Mapa das telas

```
Login ──► Entrar no turno ──► Início (a minha lista do dia)
                                 ├── Relatório do turno     (página compartilhada do turno)
                                 ├── Páginas do laboratório (as do Power BI + Navio)
                                 │     Visão geral · Coletas · Tanques · Drops · Desvios
                                 │     Recebimento · Embarque · TAB e Coliformes · Recebimento NFC · Navios
                                 ├── Esterilização          (botões + ciclo)
                                 ├── Relatório do dia       (o mesmo do bot)
                                 ├── Admin                  [só Admin]
                                 └── Assistente (botão flutuante em todas as telas: texto, voz, foto)
```

## Telas

### 1. Login
Usuário e senha. Primeiro acesso e recuperação de senha em [06](06-api-e-auth.md). Depois de entrar, o app pede o turno (tela 2) se a pessoa ainda não entrou em nenhum.

### 2. Entrar no turno
- A pessoa escolhe **Manhã, Tarde ou Madrugada** (o app sugere pelo horário).
- O **horário de entrada e de saída** vem com o padrão do turno e **a própria pessoa edita** (atraso, saída mais cedo, escala do ADM como 15h–00h).
- Tudo o que ela registrar **enquanto estiver no turno** (app ou WhatsApp, mesmo usuário) fica ligado a esse turno. Sem entrada no turno, vale o horário padrão.
- **"Sair do turno"** registra a saída dela.

### 3. Início (a minha lista do dia)
- **Cartões no topo** (números grandes): `Para hoje` · `Atrasados` · `Desvios abertos` · `Feito no turno`. Tocar num cartão abre a lista por trás dele.
- **Pendências herdadas** do turno anterior (automáticas e escritas à mão), com quem encerrou.
- **"Para fazer agora"**, nos blocos do relatório do dia (FCOJ Recebimento, FCOJ Embarque, NFC Tank farm, NFC Navio), com barra de andamento por bloco (feito × previsto). Cada linha tem **"Fazer"**: abre o formulário ou o assistente já com o item escolhido (ex.: "concluir drops de hoje").
- **"Meus registros de hoje"**: o que eu fiz, com atalho para corrigir.

### 4. Relatório do turno (página compartilhada)
**Uma página por turno e por dia**, a mesma para todos do turno, atualizada ao vivo.

| Campo | Como é preenchido |
|---|---|
| **Data** | Automático. A Madrugada conta no dia em que **começou** |
| **Turno** | Automático (Manhã, Tarde, Madrugada) |
| **Analistas do turno** | Quem entrou no turno pelo app, com entrada e saída de cada um; editável à mão |
| **Análises feitas** | Automático: coletas, drops, leituras de NFC, C.T/B.L, TAB, Coliformes, Howard, recebimentos, embarques, desvios e repetições registrados no turno |
| **Análises pendentes** | Automático (vence hoje e não feito, atrasados, desvios abertos e repetições a ler, TAB/Coliformes em confirmação, C.T/B.L sem valor) + campo **escrito à mão** |
| **Esterilizações realizadas** | Automático, da tela de esterilização (tipo, ciclo, quem) |
| **Esterilizações pendentes** | **Escrito à mão** (sob demanda) |
| **Ocorrências do dia** | Texto livre |

**Como um registro cai no turno:** pela hora em que foi gravado e por quem gravou (a entrada no turno dessa pessoa). A tela mostra o turno, nunca a hora.

**Limitação até o pedido PB1:** a pré-leitura e a leitura final do NFC (`analises`) não guardam a hora; até a sessão do bot acrescentá-la, essas leituras aparecem no relatório do dia como "turno não identificado".

**Encerramento:**
1. Cada pessoa toca em **"Sair do turno"** ao ir embora.
2. A **última pessoa** confere a página e toca em **"Encerrar turno"**; o app mostra o que passa adiante ("Ficam para a Tarde: 3 leituras, 1 desvio aberto, 2 recados").
3. As pendências aparecem no Início e no relatório do **próximo turno** ("herdadas da Manhã de 15/10").
4. Se ninguém encerrar, o turno **se encerra sozinho** quando o próximo começa ("encerrado automaticamente").
5. Encerrado = **só leitura**; o Admin reabre com motivo.

Botão **Imprimir** (o relatório inteiro, em uma folha A4).

### 5. Páginas do laboratório (as do Power BI, interativas)

Cada página do Power BI vira uma página do app, **no mesmo padrão**: cartões no topo, filtros, gráficos simples e **uma tabela**. A diferença: no app dá para **mexer** (editar, excluir, corrigir com o assistente).

| Página | O que mostra | Fonte (views) |
|---|---|---|
| **Visão geral** | Números do período, pendências por bloco, alertas 🚨 | `bi.*` |
| **Coletas** | Coletas de terra e navio, quem coletou, tanque, data | `bi.coletas` |
| **Tanques** | Leituras de C.T, B.L, WORT por tanque (normal e stress), situação ok/não ok | `bi.leituras_nfc`, `vw_situacao_nfc` |
| **Drops** | D5, D10, D15 previstos e concluídos, quem concluiu | `bi.drops` |
| **Desvios** | Desvios de drop e de tanque, repetições, abertos × fechados | `bi.desvios` |
| **Recebimento** | Loads, lotes, compostas, C.T/B.L por lote com 🚨 | `bi.contagens`, `vw_compostas` |
| **Embarque** | Navio, linha, fase, amostras, C.T/B.L, Howard | `bi.contagens`, `bi.testes` |
| **TAB e Coliformes** | Por composta e por tanque: status (Incubado, Estriado...), resultado | `bi.testes` |
| **Recebimento NFC** | Lotes do item 129, fresh/past, diluição, C.T/B.L já multiplicados (sem 🚨) | `bi.recebimento_nfc` |
| **Navios** (nova) | Por navio e viagem: tanques coletados, analisados, pendentes, desvios | `bi.coletas`, `bi.leituras_nfc`, `bi.desvios` |

**Em toda página com lista:**
- **Filtros** no topo: período, load, lote, tanque, navio, fábrica, usuário (quem fez), situação (ok, não ok, pendente). O filtro escolhido aparece como "etiquetas" removíveis.
- **Imprimir só o que está filtrado**, como no Excel: a tabela filtrada vira uma página A4 limpa, com o título, os filtros usados, a data e quem imprimiu.
- **Exportar para Excel** (`.xlsx`) o que está filtrado.
- **Tocar numa linha** abre o **detalhe**: todos os dados, quem fez e quando, e os botões **Editar**, **Excluir**, **Corrigir com o assistente** e **Histórico** (conforme o cargo).
- **Gráficos** de cada página respondem ao mesmo filtro; tocar numa barra filtra a tabela.

**Ordem de entrega recomendada:** primeiro **só leitura** (filtros, impressão, exportação), página por página; editar e excluir chegam **página por página**, à medida que a sessão do bot cria as funções do banco daquela área (começando por **Coletas** e **Recebimento**).

### 6. Gráficos
Ficam **dentro das páginas** (cada página com os seus), não numa tela separada. Os números vêm das mesmas views do Power BI, para baterem. **Recomendo** começar com:

| # | Gráfico | Página | Tipo |
|---|---|---|---|
| G1 | **Feito × pendente por turno**, 14 dias | Visão geral | Barras empilhadas |
| G2 | **C.T e B.L por load** ao longo do tempo, com a **linha do limite** | Recebimento | Pontos; acima do limite em vermelho com 🚨 |
| G3 | **Desvios por semana**, abertos × fechados | Desvios | Barras |
| G4 | **Esterilizações por tipo e turno**, semana | Esterilização | Barras agrupadas |

Sem gráfico "por pessoa" (pode soar como vigilância).

### 7. Esterilização
- **Botões grandes:** **Ponteira, Meio, Frasco, Descarte** e **Outro** (texto livre).
- Um passo só: **número do ciclo** (obrigatório) e, para Meio, o nome do meio (opcional, ex.: PDA). **Registrar**. Pode também pelo assistente: "esterilizei ponteira, ciclo 102".
- Grava tipo, ciclo, quem e quando em `app.esterilizacoes`. **Sem resultado da fita** (o ok/não ok sai da nota da autoclave). A anotação no **Word continua** como rastreio oficial.
- Lista das esterilizações do turno embaixo dos botões, com corrigir e excluir (com motivo).

### 8. Assistente de IA (botão flutuante)
- **Em todas as telas**, um botão redondo no canto: toca e escolhe **escrever**, **falar** ou **foto**.
- Faz **tudo o que o bot faz** (mesmos comandos, mesmas regras, mesmo pipeline regex → IA → "sim"), mais:
  - **Contexto da tela:** aberto a partir de uma linha ("Corrigir com o assistente"), já sabe qual registro é.
  - **Resposta com botões:** "Sim" e "Não" viram botões; vale a regra do bot de **uma mensagem e um sim** para a lista inteira, explicando o que será criado.
  - **Depois do sim, leva à página:** "✅ 6 leituras marcadas. **Ver em Tanques**".
- **Foto de laudo:** mesmo fluxo do bot ([foto-laudo](../foto-laudo.md)): lê, mostra o que entendeu e o que ficou em dúvida, **um sim**, e a página de leituras se atualiza. Nunca abre desvio sozinho (lista os não ok com o botão pronto).
- **Voz:** mesmo fluxo do áudio do bot (o texto transcrito vai para a IA; tudo que grava pede sim).
- Desenho técnico (como o app conversa com o n8n) em [06](06-api-e-auth.md) e [08](08-fluxos.md).

### 9. Relatório do dia
O mesmo texto do `relatório do dia` do bot (pedido ao bot pelo assistente, para ser idêntico), mostrado formatado, com os filtros como botões (`completo`, `recebimento`, `embarque`, `tanques`) e **Imprimir**.

### 10. Admin
Usuários (nome, cargo), convite de primeiro acesso, zerar senha, bloquear acesso ao app, horários padrão dos turnos, reabrir turno encerrado. Trocar cargo continua pelo bot enquanto o cargo morar em `usuarios`; com a função do banco, passa a ser também pelo app.

## Permissões (decididas em 15/10)

O **Operador é o analista em geral**.

| Ação | Admin | Operador | Consultor | Coletor (futuro) |
|---|---|---|---|---|
| Ver Início, páginas, gráficos e relatórios; filtrar, imprimir, exportar | ✅ | ✅ | ✅ | Só as próprias coletas e as pendências de coleta |
| Entrar no turno e editar o próprio horário | ✅ | ✅ | ❌ | ✅ |
| Encerrar o turno | ✅ | ✅ | ❌ | ❌ |
| Registrar coletas | ✅ | ✅ | ❌ | ✅ |
| Registrar análises, resultados, desvios e esterilização | ✅ | ✅ | ❌ | ❌ |
| Corrigir registro (com motivo) | ✅ | ✅ | ❌ | Só a própria coleta, no mesmo dia |
| Excluir registro (com motivo e confirmação; fica no histórico) | ✅ | ✅ | ❌ | Pede ao Admin |
| Usar o assistente | ✅ | ✅ | Só consultas | Só coletas |
| Adicionar pessoa, convite, senha, trocar cargo | ✅ | ❌ | ❌ | ❌ |
| Horários padrão dos turnos, reabrir turno | ✅ | ❌ | ❌ | ❌ |

O cargo **Coletor** depende do pedido PB2 à sessão do bot.

## Visual (decidido em 15/10)

- **Estilo** dos LIMS comerciais. **Computador e tablet:** menu na lateral, cartões com números grandes, tabelas com filtros, listas com barra de andamento. **Celular:** barra embaixo (**Início · Turno · Páginas · Esterilização · Assistente**) e cartões empilhados; tabelas viram cartões por linha.
- **Três tamanhos** desde o começo: celular, tablet e computador.
- **Fácil para leigos:** botões grandes com texto (não só ícone), uma ação principal por tela, confirmação sempre em português simples, nada se perde sem perguntar.
- **Paleta clara** (laranja claro e creme), ponto de partida a ajustar na tela:

  | Uso | Cor |
  |---|---|
  | Fundo | creme `#FBF6E9` |
  | Cartões | branco `#FFFFFF` com borda `#EADFC4` |
  | Principal (barra, destaques) | laranja claro `#F6B04A` |
  | Texto | marrom-escuro `#4A3418` |
  | Botões de ação | azul `#2F7BC4` |
  | Ok · Não ok · Atenção | verde `#2E8B57` · vermelho `#C0392B` · âmbar `#E0A100` |

  Ok/não ok **nunca só pela cor**: sempre com ✅, 🚨 ou o texto. Impressão em preto e branco legível.
- **Sem nome, logotipo ou fotos da empresa** no repositório e no app de demonstração: o app aparece só como **"LabFlow"**.

## Tabelas do app (schema `app`, a partir da 030)

Nomes a confirmar na migration. Nenhuma altera tabela do bot (só referenciam `usuarios(id)`).

| Tabela | Para quê |
|---|---|
| `app.turnos` | Manhã, Tarde, Madrugada com o horário padrão |
| `app.entradas_turno` | Quem entrou em qual turno e dia, com entrada e saída editadas pela pessoa |
| `app.relatorios_turno` | Uma linha por turno e dia: textos escritos à mão, encerrado por/em, automático sim/não, reaberto por/em/motivo |
| `app.esterilizacoes` | Tipo, ciclo, meio (opcional), quem, quando |

Login em [06](06-api-e-auth.md). As **funções do banco** para editar e excluir dados do bot não são tabelas do app: são criadas com a sessão do bot (PB4).

## Fases de entrega (dentro do rumo)

| Fase do rumo | O que este documento entrega |
|---|---|
| B | API de leitura e login |
| C | Login, turno, Início, relatório do turno, esterilização, **todas as páginas em leitura** (filtros, imprimir, exportar), gráficos G1–G4 |
| D | **Assistente** (texto, voz, foto) e **editar/excluir** página por página, conforme as funções do banco ficam prontas |
| E | Decidir o futuro do WhatsApp |

## Fora do escopo (por ora)

Notificação no celular, modo offline, loja de aplicativos, enviar relatório pelo WhatsApp, gráfico por pessoa. (Ideias no [rumo](rumo-do-app.md).)

## Perguntas ainda abertas

- [ ] **Gráficos:** começar com G1 a G4?
- [ ] **Paleta:** os códigos de cor acima servem como ponto de partida?
- [ ] **Impressão:** só A4 retrato, ou também paisagem para tabelas largas (Embarque, Tanques)?
- [ ] **Primeiras páginas com editar/excluir:** Coletas e Recebimento, como recomendado?
- [ ] **Excluir:** o registro some de vez ou fica "excluído" (escondido, mas guardado para o histórico)? **Recomendo** guardar (ISO 17025: o dado original não se perde), que é o "invalidar" do doc [04](04-revisao-e-liberacao.md).

## Pronto quando

As perguntas acima estão respondidas, o [06](06-api-e-auth.md) e o [08](08-fluxos.md) estão revisados no mesmo nível, e o Danyllo aprova: o documento vai a `status: approved`, `version: v1.0`, e só então as telas viram tarefas (`APP-001`...), cada uma citando a seção de origem.
