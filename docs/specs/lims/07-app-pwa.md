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
- **Tabelas próprias do app** (turno, relatório do turno, esterilização) no schema `app`, migrations a partir da `050` (027–049 são da sessão do bot).
- **Tudo que grava mostra o que vai mudar e pede uma confirmação**, como o "sim" do bot: "antes → depois" na correção; a lista inteira na foto (**um sim** para a lista toda).
- **Excluir não apaga** (decidido em 15/10): o registro sai das páginas e das contas, mas fica guardado como **excluído**, com quem, quando e o motivo; o Admin vê na aba Histórico e pode recuperar (é o "invalidar" do doc [04](04-revisao-e-liberacao.md); ISO 17025: o dado original não se perde).
- **Motivo** (decidido em 16/10): corrigir ou excluir **coleta não pede motivo**; corrigir ou excluir **análise e resultado pede motivo**. Tudo fica no histórico (com o LIMS, o histórico é o da [auditoria](02-audit-trail.md)).
- Permissão conferida **no código da API** a cada chamada, pelo cargo; nunca no prompt da IA.
- **Só online.** Primeiro só no servidor de demonstração, com dados fictícios.
- Termos do bot: **drop**, **desvio**, **repetição** (nunca "reanálise"); TAB e Coliformes no masculino.
- **Visual formal, sem emoji** (decidido em 15/10): emoji é coisa do WhatsApp. No app, a situação aparece como **etiqueta de texto** com cor: **Ok**, **Não ok**, **Positivo**, **Negativo**, **Pendente**, **Em confirmação**, **Excluído**. Textos que vêm do bot (respostas do assistente, relatório do dia) são mostrados **sem os emojis**, trocados pela etiqueta equivalente (ex.: o ✅ do bot vira "Ok"; o alerta vira "Não ok").

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
- **Pendências herdadas** do turno anterior (automáticas e escritas à mão), com quem encerrou. Cada item tem uma **caixa de marcar "Feito"** ao lado (decidido em 15/10): no item escrito à mão, marcar grava quem fez e quando; no item automático (ex.: uma leitura), marcar abre a confirmação do registro correspondente e grava pela função do banco.
- **"Para fazer agora" = as atividades fixas do turno** (decidido em 15/10): uma lista de verificação com as tarefas fixas de cada turno (cadastradas pelo Admin em `app.atividades_fixas`; **a lista será passada pelo Danyllo**), cada uma com a caixa **"Feito"** (grava quem e quando). Abaixo, o que **vence hoje** no banco (drops, leituras, C.T/B.L, TAB/Coliformes), nos blocos do relatório do dia, com o botão **"Fazer"** que abre o formulário ou o assistente já com o item escolhido.
- **Tamanho:** cartões e listas **compactos** (o celular precisa mostrar a lista do turno sem rolar muito); números grandes só nos quatro cartões do topo.
- **"Meus registros de hoje"**: o que eu fiz, com atalho para corrigir.

#### Atividades fixas de cada turno (lista inicial, passada pelo Danyllo em 16/10)
É a mesma lista de verificação da planilha "Relatório de turno" do laboratório; o Admin pode mudar depois. Na planilha, cada item é marcado com "x" (feito) ou "0" (não feito); no app, cada item tem **Feito** e **Não feito**, e o não feito passa como pendência para o próximo turno.

| Manhã | Tarde | Madrugada |
|---|---|---|
| Leitura de placa | Análise de TAB / Enriquecimento SP | Análise recebimento / embarque |
| Planilhas | Registro diário | Coliformes Colina |
| Materiais | Análise NFC recebimento | Coliformes demais fábricas (**só às sextas**) |
| Meios de cultura | Monitoramento ambiental | Análise pH PDA e Meio BAT |
| Drops | Análise sanitizante + TK 30 (água) | Água do processo |
| Análise dos TQs | Arquivo microrganismo (C4) | Plaquear (WORT, PCA, MB, YEGCA, Cr.ES) |
| Howard | Day Tank | 5S / Limpeza e organização |
| 5S / Limpeza e organização | 5S / Limpeza e organização | |
| Reagentes | | |
| Calibração | | |
| Conservação bicicletas | | |

Item com dia certo (ex.: "só às sextas") aparece só nesse dia.

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

Botão **Imprimir** (o relatório inteiro, A4 em pé).

### 5. Páginas do laboratório (as do Power BI, interativas)

Cada página do Power BI vira uma página do app, **no mesmo padrão**: cartões no topo, filtros, gráficos simples e **uma tabela**. A diferença: no app dá para **mexer** (editar, excluir, corrigir com o assistente).

| Página | O que mostra | Fonte (views) |
|---|---|---|
| **Visão geral** | Números do período, pendências por bloco, alertas (Não ok) | `bi.*` |
| **Coletas** | Coletas de terra e navio, **quem coletou** (o "coletado por" da migration 028 do bot, ou quem registrou) e **quem digitou**, tanque, data | `bi.coletas` |
| **Tanques** | Leituras de C.T, B.L, WORT por tanque (normal e stress), situação ok/não ok | `bi.leituras_nfc`, `vw_situacao_nfc` |
| **Drops** | D5, D10, D15 previstos e concluídos, quem concluiu | `bi.drops` |
| **Desvios** | Desvios de drop e de tanque, repetições, abertos × fechados | `bi.desvios` |
| **Recebimento** | Loads, lotes, compostas, C.T/B.L por lote com a situação Ok / Não ok | `bi.contagens`, `vw_compostas` |
| **Embarque** | Navio, linha, fase, amostras, C.T/B.L, Howard | `bi.contagens`, `bi.testes` |
| **TAB e Coliformes** | Por composta e por tanque: status (Incubado, Estriado...), resultado | `bi.testes` |
| **Recebimento NFC** | Lotes do item 129, fresh/past, diluição, C.T/B.L já multiplicados (sem situação Ok / Não ok) | `bi.recebimento_nfc` |
| **Navios** (nova) | Por navio e viagem: tanques coletados, analisados, pendentes, desvios | `bi.coletas`, `bi.leituras_nfc`, `bi.desvios` |

**Em toda página com lista:**
- **Filtros** no topo: período, load, lote, tanque, navio, fábrica, usuário (quem fez), situação (ok, não ok, pendente). O filtro escolhido aparece como "etiquetas" removíveis.
- **Imprimir só o que está filtrado**, como no Excel (decidido em 15/10): A4, **em pé** por padrão para relatórios e listas estreitas (Coletas, Drops) e **deitado** para tabelas largas (Embarque, Tanques, Recebimento com C.T/B.L); a pessoa **pode trocar** antes de imprimir. No topo: título da página, filtros usados e data; no rodapé: "página 1 de 3". Formal, sem emoji, legível em preto e branco.
- **Exportar para Excel** (`.xlsx`) o que está filtrado.
- Imprimir e exportar são **livres para todos os cargos que veem a página, inclusive o Consultor, sem registro** de quem fez (decidido em 15/10).
- **Tocar numa linha** abre o **detalhe**: todos os dados, quem fez e quando, e os botões **Editar**, **Excluir**, **Corrigir com o assistente** e **Histórico** (conforme o cargo).
- **Gráficos** de cada página respondem ao mesmo filtro; tocar numa barra filtra a tabela.

**Ordem de entrega (decidida em 15/10):** primeiro **todas as páginas só em leitura** (filtros, impressão, exportação). Editar e excluir chegam **página por página**, à medida que a sessão do bot cria as funções do banco daquela área: **1) Coletas e Recebimento** (os mais usados, uma linha por registro); **2)** Drops, TAB e Coliformes, Embarque; **3)** resultados (C.T/B.L, leituras de NFC), depois da revisão e liberação da Fase 1 do LIMS.

### 6. Gráficos
Ficam **dentro das páginas** (cada página com os seus), não numa tela separada. Os números vêm das mesmas views do Power BI, para baterem. **Decidido em 15/10: por enquanto só dois** (G1 "feito × pendente" e G3 "desvios por semana" saíram, por não acrescentarem; mais gráficos só quando houver necessidade):

| # | Gráfico | Página | Tipo |
|---|---|---|---|
| G2 | **C.T e B.L por load** ao longo do tempo, com a **linha do limite** | Recebimento | Pontos; acima do limite em vermelho, com a etiqueta "Não ok" |
| G4 | **Esterilizações por tipo e turno**, semana | Esterilização | Barras agrupadas |

Sem gráfico "por pessoa" (pode soar como vigilância).

### 7. Esterilização
- **Botões grandes:** **Ponteira, Meio, Frasco, Descarte** e **Outro** (texto livre).
- Um passo só: **número do ciclo** (obrigatório) e, para Meio, o nome do meio (opcional, ex.: PDA). **Registrar**. Pode também pelo assistente: "esterilizei ponteira, ciclo 102".
- Grava tipo, ciclo, quem e quando em `app.esterilizacoes`. **Sem resultado da fita** (o ok/não ok sai da nota da autoclave). A anotação no **Word continua** como rastreio oficial.
- Lista das esterilizações do turno embaixo dos botões, com corrigir e excluir (com motivo).

### 7.1 Temperatura das estufas
- **Obrigatória em todo turno, para todos** (não é atividade fixa de um turno só). Tem **aba própria, Estufas**, e um **bloco no fim do Início** com as estufas do turno (conferidas e pendentes).
- **Uma conferência por estufa no início de cada turno** (decidido em 15/10, confirmado em 16/10: por turno, não uma por dia como nos blocos da planilha).
- **Duas leituras por estufa, como na planilha** (decidido em 16/10): **Supervisório (painel)** e **Field chart**. Cada leitura tem os botões **Ok** e **Não ok**. Ok não pede número. **Não ok** abre o campo para **digitar a temperatura** que aquela leitura está marcando (obrigatório) e uma observação opcional. A estufa 06 (auxiliar) também tem as duas leituras, sem faixa.
- **Status da estufa:** Ok se as duas leituras estiverem Ok; **Não ok** se qualquer uma estiver Não ok (fica em vermelho, como na planilha). A **diferença** (field chart − supervisório) só aparece quando as duas temperaturas foram digitadas.
- Cada conferência grava estufa, leitura (supervisório ou field chart), Ok/Não ok, temperatura (só no Não ok, °C com uma casa decimal), quem, **quando** (data e hora) e o **turno**, em `app.leituras_estufa`.
- Ao lado de cada estufa, a **faixa de trabalho** (mínimo e máximo, cadastrada pelo Admin), para a pessoa comparar. Esse valor fica só no banco; no repositório, só valores fictícios.
- A estufa ainda não conferida no turno fica **Pendente**. Estufa **Não ok** entra nas **ocorrências do relatório do turno** com a temperatura anotada (sem abrir nada sozinho).
- Pelo assistente também vale: "estufa 3 ok no painel, field chart 43,8".
- **Estufas (passadas pelo Danyllo em 16/10):** **11 estufas**: 01, 02, 03, 04, 06, 07, 08, 09, 10, 11 e 12 (não existe a 05). A **06 é auxiliar** (sem faixa de trabalho). As demais têm **faixa de trabalho** (mínimo e máximo em °C), que fica **só no banco** (carregada fora do Git); no repositório, só valores fictícios.
- **A planilha atual** registra, para cada estufa: faixa de trabalho, leitura do **supervisório**, leitura do **field chart**, **diferença** entre as duas, status, responsável e data, numa aba por mês. O app substitui essa planilha (decidido em 16/10).

### 8. Assistente de IA (botão flutuante)
- **Em todas as telas**, um botão redondo no canto: toca e escolhe **escrever**, **falar** ou **foto**.
- Faz **tudo o que o bot faz** (mesmos comandos, mesmas regras, mesmo pipeline regex → IA → "sim"), mais:
  - **Contexto da tela:** aberto a partir de uma linha ("Corrigir com o assistente"), já sabe qual registro é.
  - **Resposta com botões:** "Sim" e "Não" viram botões; vale a regra do bot de **uma mensagem e um sim** para a lista inteira, explicando o que será criado.
  - **Depois do sim, leva à página:** "6 leituras marcadas. **Ver em Tanques**".
- **Foto de laudo:** mesmo fluxo do bot ([foto-laudo](../foto-laudo.md)): lê, mostra o que entendeu e o que ficou em dúvida, **um sim**, e a página de leituras se atualiza. Nunca abre desvio sozinho (lista os não ok com o botão pronto).
- **Voz:** mesmo fluxo do áudio do bot (o texto transcrito vai para a IA; tudo que grava pede sim).
- Desenho técnico (como o app conversa com o n8n) em [06](06-api-e-auth.md) e [08](08-fluxos.md).

### 9. Relatório do dia
O mesmo texto do `relatório do dia` do bot (pedido ao bot pelo assistente, para ser idêntico), mostrado formatado e **sem emojis** (etiquetas de texto no lugar), com os filtros como botões (`completo`, `recebimento`, `embarque`, `tanques`) e **Imprimir**.

### 10. Admin
- **Pessoas** (decidido em 15/10, já na primeira versão): lista com nome, usuário, cargo e situação (ativo, senha provisória pendente, bloqueado).
  - **"Nova pessoa"**: nome, telefone, cargo (Admin, Operador, Consultor; Coletor no futuro) e **usuário curto** (ex.: `ana.souza`). **"Cadastrar e gerar senha provisória"** confirma uma vez e mostra uma **senha aleatória** (24 h) para o Admin entregar; no primeiro login a pessoa é obrigada a trocá-la ([06](06-api-e-auth.md)).
  - **Trocar cargo**, **gerar senha provisória** (esqueceu a senha) e **bloquear acesso**, cada um com confirmação; fica registrado quem fez e quando.
  - Cadastrar e trocar cargo usam as **funções do banco** pedidas à sessão do bot (PB5), as mesmas do comando do WhatsApp: quem é cadastrado pelo app já é reconhecido no bot, e vice-versa.
- Horários padrão dos turnos, atividades fixas de cada turno, estufas (nome e temperatura de referência), reabrir turno encerrado.

## Permissões (decididas em 15/10)

O **Operador é o analista em geral**.

| Ação | Admin | Operador | Consultor | Coletor (futuro) |
|---|---|---|---|---|
| Ver Início, páginas, gráficos e relatórios; filtrar, imprimir, exportar | Sim | Sim | Sim | Só as próprias coletas e as pendências de coleta |
| Entrar no turno e editar o próprio horário | Sim | Sim | Não | Sim |
| Encerrar o turno | Sim | Sim | Não | Não |
| Registrar coletas | Sim | Sim | Não | Sim |
| Registrar análises, resultados, desvios e esterilização | Sim | Sim | Não | Não |
| Corrigir registro (coleta sem motivo; análise com motivo) | Sim | Sim | Não | Só a própria coleta |
| Excluir registro (com confirmação; coleta sem motivo, análise com motivo; fica no histórico) | Sim | Sim | Não | Só a própria coleta (como no bot, migration 029) |
| Usar o assistente | Sim | Sim | Só consultas | Só coletas |
| Adicionar pessoa, gerar senha provisória, trocar cargo | Sim | Não | Não | Não |
| Horários padrão dos turnos, reabrir turno | Sim | Não | Não | Não |

O cargo **Coletor** depende do pedido PB2 à sessão do bot.

## Visual (decidido em 15/10)

- **Estilo** dos LIMS comerciais. **Computador e tablet:** menu na lateral, cartões com números grandes, tabelas com filtros, listas com barra de andamento. **Celular:** barra embaixo (**Início · Turno · Páginas · Esterilização · Assistente**) e cartões empilhados; tabelas viram cartões por linha.
- **Três tamanhos** desde o começo: celular, tablet e computador.
- **Fácil para leigos:** botões grandes com texto (não só ícone), uma ação principal por tela, confirmação sempre em português simples, nada se perde sem perguntar.
- **Paleta clara** (laranja claro e creme), **aprovada pelo Danyllo em 15/10** depois de uma prévia visual com dados fictícios (fora do repositório):

  | Uso | Cor |
  |---|---|
  | Fundo | creme `#FBF6E9` |
  | Cartões | branco `#FFFFFF` com borda `#EADFC4` |
  | Menu lateral (computador), topo (celular), destaques | laranja claro `#F6B04A`, com letra preta |
  | Item ativo do menu | `#FFF4E0` |
  | Texto | preto `#1C1C1C` (sem marrom) |
  | Laranja suave (filtros, linha selecionada) | `#FCE7C3` |
  | Texto secundário | cinza `#5C5C5C` |
  | Botões de ação | azul `#2F7BC4` |
  | Ok · Não ok · Atenção | verde `#2E8B57` · vermelho `#C0392B` · âmbar `#E0A100` |

  Ok/não ok **nunca só pela cor**: sempre com o texto da etiqueta. Impressão em preto e branco legível.
- **Sem nome, logotipo ou fotos da empresa** no repositório e no app de demonstração: o app aparece só como **"LabFlow"**.

## Tabelas do app (schema `app`, a partir da 050)

Nomes a confirmar na migration. Nenhuma altera tabela do bot (só referenciam `usuarios(id)`).

| Tabela | Para quê |
|---|---|
| `app.turnos` | Manhã, Tarde, Madrugada com o horário padrão |
| `app.entradas_turno` | Quem entrou em qual turno e dia, com entrada e saída editadas pela pessoa |
| `app.relatorios_turno` | Uma linha por turno e dia: textos escritos à mão, encerrado por/em, automático sim/não, reaberto por/em/motivo |
| `app.esterilizacoes` | Tipo, ciclo, meio (opcional), quem, quando |
| `app.atividades_fixas` | Atividades fixas de cada turno (texto, turno, dias da semana, ordem), cadastradas pelo Admin |
| `app.atividades_feitas` | Atividade fixa ou pendência herdada marcada como feita: quem, quando, turno |
| `app.estufas` | Cada estufa (número, auxiliar sim/não, faixa de trabalho mínima e máxima com vigência; valores reais só no banco) |
| `app.leituras_estufa` | Estufa, leitura (supervisório ou field chart), Ok/Não ok, temperatura (só no Não ok), observação, quem, quando, turno |

Login em [06](06-api-e-auth.md). As **funções do banco** para editar e excluir dados do bot não são tabelas do app: são criadas com a sessão do bot (PB4).

## Fases de entrega (dentro do rumo)

| Fase do rumo | O que este documento entrega |
|---|---|
| B | API de leitura e login |
| C | Login, turno, Início, relatório do turno, esterilização, **todas as páginas em leitura** (filtros, imprimir, exportar), gráficos G2 e G4 |
| D | **Assistente** (texto, voz, foto) e **editar/excluir** página por página, conforme as funções do banco ficam prontas |
| E | Decidir o futuro do WhatsApp |

## Fora do escopo (por ora)

Notificação no celular, modo offline, loja de aplicativos, enviar relatório pelo WhatsApp, gráfico por pessoa. (Ideias no [rumo](rumo-do-app.md).)

## Perguntas ainda abertas



## Pronto quando

As perguntas acima estão respondidas, o [06](06-api-e-auth.md) e o [08](08-fluxos.md) estão revisados no mesmo nível, e o Danyllo aprova: o documento vai a `status: approved`, `version: v1.0`, e só então as telas viram tarefas (`APP-001`...), cada uma citando a seção de origem.
