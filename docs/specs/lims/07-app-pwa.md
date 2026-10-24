---
title: LabFlow LIMS — App (PWA)
tags: [labflow, lims, spec, app, pwa]
status: approved
version: v1.0
created: 2026-10-07
updated: 2026-10-16
---

# App web/mobile (PWA): a cara do LIMS

**Navegação:** [Índice](index.md) · Anterior: [API e autenticação](06-api-e-auth.md) · Próximo: [Fluxos](08-fluxos.md) · Bússola: [Rumo do app](rumo-do-app.md)

> **v1.0 aprovada pelo Danyllo em 16/10/2026.** A especificação está fechada e pode virar tarefas e código (`APP-001`...). Mudar algo daqui em diante exige motivo novo, registrado em [10](10-decisoes.md).
>
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
Usuário e senha. Primeiro acesso e recuperação de senha em [06](06-api-e-auth.md). Depois de entrar, o app pede o turno (tela 2) se a pessoa ainda não entrou em nenhum. Visual (APP-046, 24/10): fundo azul do menu e cartão branco no centro, com o título "LabFlow · Laboratório de microbiologia".

### 2. Entrar no turno
- A pessoa escolhe **Manhã, Tarde ou Madrugada** (o app sugere pelo horário).
- **Check-in** (decidido em 23/10): a entrada vale **a hora do toque** em "Entrar no turno", e a saída a hora do toque em "Sair do turno". Dá para entrar no turno em andamento ou no próximo, se ele começa em até 2 horas.
- **Operador e Coletor só usam o resto do app depois de marcar a entrada** (Início, páginas, relatório do turno); antes disso, qualquer tela mostra o Turno. Admin e Consultor ficam livres. A API confere a cada chamada.
- **Corrigir o próprio horário** (esqueceu de marcar, escala do ADM como 15h–00h) **pede motivo**; o horário marcado no app fica guardado ao lado da correção (migration 053).
- Tudo o que ela registrar **enquanto estiver no turno** (app ou WhatsApp, mesmo usuário) fica ligado a esse turno. Sem entrada no turno, vale o horário padrão.
- **"Sair do turno"** registra a saída dela.
- **Central do turno** (APP-033, 23/10): vários analistas dividem o turno. A tela Turno mostra a **equipe** (quem está e quem já saiu, com a hora de entrada; atualiza sozinha), as atividades fixas e pendências herdadas, as **estufas**, as **análises a fazer hoje**, a **linha do tempo** (quem fez o quê e a que horas) e **"Atividades realizadas"** (linhas livres do relatório em Excel, com autor e hora; entram no relatório do turno). Um chip no topo de todas as telas ("Tarde · 2") mostra quantas pessoas estão no turno. Antes da entrada só a equipe aparece. Coletor não vê a linha do tempo (só as próprias coletas).

### 3. Início (a minha lista do dia)
- **Pendências por número (24/10):** em cada bloco, o que se faz junto é um grupo com o número (atrasados e para hoje); tocar abre a lista. No navio, só o nome com Normal, Stress ou Drops (os tanques dentro). TAB e Coliformes com a próxima ação (para espalhar, para ler, para confirmar).
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
- **Visual repaginado, parte 2 (APP-055, 24/10):** abaixo dos blocos, o **gráfico da semana** com o que foi concluído em cada um dos últimos 7 dias (TAB, Coliformes, NFC = leituras de tanque e drops, C.T/B.L = leituras de recebimento, embarque e NFC recebido), com a legenda e os totais ao lado (`GET /painel/semana`). No pé do menu lateral (computador), o **cartão das folhas**: a folha de laudo mais perto de encher ("faltam N linhas", barra de progresso) ou as folhas cheias esperando impressão, com "Ver o laudo" (`GET /painel/folhas`). O conteúdo ocupa a largura toda da tela, e no modo escuro os blocos coloridos ficam mais escuros e menos saturados.
- **Layout do canvas (APP-056, 24/10):** no topo do Início, o cartão **"Agora"**: o relógio com o turno ("Manhã · 08:00 às 16:00 · faltam 3 h 32"), o chip das estufas (OK, para conferir ou não ok), o **registro livre** ("O que você está fazendo?", vai para a linha do tempo do turno) e os **3 destaques do dia** (os grupos com mais coisa, atrasados primeiro) em blocos coloridos. **Os botões dos destaques só abrem a página certa** ("Ver os 17"); gravar em lote por eles vem depois do PB13, com a lista toda marcada e um único "Confirmar", como o "sim" do bot (decidido em 24/10). No Turno, a **equipe** (iniciais, desde quando e quantos registros cada um fez) e as **estufas** (temperatura e situação de cada uma, "não ok desde 08:10") ficam lado a lado; a linha do tempo vira **"Quem fez o quê"**, com etiqueta colorida por tipo, quem, a hora e o filtro por pessoa.

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

**Registros adiantados pelo Admin** (decidido em 17/10): os comandos do Admin que gravam resultados de uma vez (placas `<1` com origem `automatico`, C.T/B.L `<10`, drops concluídos pelo TAB de tanque completo) ficam com a hora da **digitação**, não da leitura na bancada. No relatório do turno eles aparecem numa linha separada, **"Adiantado pelo Admin"**, com a **data prevista** de cada um, e **não entram** em "Análises feitas" do turno em que foram digitados. Nas páginas, a etiqueta **Adiantado** aparece ao lado da hora.

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

**Recebimento de FCOJ: corrigir e excluir pelo app (APP-045, 24/10; migration 064).** Na aba Páginas, "Corrigir ou excluir um lote do recebimento": busca o load pelo número e mostra os lotes; corrige número, item e fábrica do load ou número e data do lote, e exclui (arquiva) o lote. As regras são as das funções do banco do bot (036): só Admin e Analista, lote com leitura ou teste não muda a data nem se exclui; a recusa aparece como veio. Recuperar fica para o Admin, numa próxima tela.

### 5.1 Águas e superfícies (APP-037, decidido em 24/10; migrations 061 e 062)
- São **análises**: ficam na aba Páginas, no grupo "Águas e superfícies", com o laudo de cada uma na própria tela.
- **Água do processo:** uma coleta (data e hora) com os pontos coletados (Manifold, Câmaras 4, 5 e 6); C.T. (PCA, 48 h) e B.L. (PDA, 120 h) de cada ponto; ponto não coletado sai "-"; observação livre ("Esterilizando"). Laudo sobre a folha digitalizada do terminal (tabela deitada), 23 coletas por folha.
- **Baias** (CIP dos mangotes do recebimento) e **linhas** (CIP das linhas de embarque): uma coleta por ponto, com o dia da análise (plaqueamento); C.T. 48 h, B.L. 72 h e 120 h contados desse dia. Laudo "Limpeza de Superfícies", uma folha para baias e outra para linhas, 31 por folha, com "Análise dd.mm.aa" na observação.
- Coletor registra a coleta; Admin e Analista lançam o resultado (`<1` ou número). A leitura que falta vira pendência no Início (bloco "Águas e superfícies") na data prevista.

### 6. Gráficos
Ficam **dentro das páginas** (cada página com os seus), não numa tela separada. Os números vêm das mesmas views do Power BI, para baterem. **Decidido em 15/10: por enquanto só dois** (G1 "feito × pendente" e G3 "desvios por semana" saíram, por não acrescentarem; mais gráficos só quando houver necessidade):

| # | Gráfico | Página | Tipo |
|---|---|---|---|
| G2 | **C.T e B.L por load** ao longo do tempo, com a **linha do limite** | Recebimento | Pontos; acima do limite em vermelho, com a etiqueta "Não ok" |
| G4 | **Esterilizações por tipo e turno**, semana | Esterilização | Barras agrupadas |

Sem gráfico "por pessoa" (pode soar como vigilância).

### 7. Esterilização
- **Botões grandes:** **Ponteira, Meio, Frasco, Descarte** e **Outro** (texto livre). **Pode escolher mais de um** quando foram juntos no mesmo ciclo (24/10): um registro por material, uma linha no laudo.
- Um passo só: **número do ciclo** (obrigatório) e, para Meio, o nome do meio (opcional, ex.: PDA). **Registrar**. Pode também pelo assistente: "esterilizei ponteira, ciclo 102".
- Grava tipo, ciclo, quem e quando em `app.esterilizacoes`. O **número do ciclo é digitado pela pessoa** (o app **não sugere**: duas pessoas podem registrar ciclos ao mesmo tempo); se o ciclo já tem material no dia, o app só **avisa** e o novo material entra na mesma linha do laudo.
- **Eficiente: Sim por padrão** (quase sempre é); depois de olhar a fita e a nota da autoclave, "Não eficiente" (pede motivo) vale para o ciclo todo, e "Voltar para Sim" desfaz.
- **Laudo "Controle de Ciclos de Esterilização" (APP-035, decidido em 23/10):** o app preenche o **próprio PDF da empresa** (SGI, 35 linhas por página): Data, Material esterilizado ("Meio de cultura / Frascos" quando há mais de um no ciclo), Ciclo, Sim/Não e o **nome de quem marcou** (sai do usuário logado). A assinatura (**Visto**) e o bloco do responsável ficam em branco, à mão. Página cheia vira **"pendente de imprimir"**; quem imprime marca como impressa e ela vai para o **arquivo**, com reimpressão. O PDF oficial é **confidencial: fica no banco** (Admin envia, `app.modelos_documento`), nunca no Git; sem ele o app usa uma tabela de demonstração. Pelo bot (WhatsApp) depois, como pedido à sessão do bot.
- Lista das esterilizações do turno embaixo dos botões, com corrigir e excluir (com motivo).

### 7.6 Incubação e leitura (APP-040, 24/10; migration 065, lê a `bi.incubacao` da 038 do bot)
- Laudo "Controle de Incubação e Leitura" (LAB/001): **um dia de incubação por bloco**, 7 por folha, com 4 linhas de descrição das amostras, o **lote de cada meio em uso naquele dia** (OSA, PDA, PCA, Wort) e as **datas de leitura** (OSA/PCA 48 h, PDA 72 h e 120 h, Wort 240 h). Meio sem amostra no dia sai "-", e a leitura dele também. Nome e Visto do responsável são à mão.
- **Dia da incubação** (PB10, decidido em 24/10): tanque = a `data_analise` do comando de análise (o ST leva a data que o analista disser, **sem somar dia**); recebimento e embarque = o dia em que chegam; recebimento NFC = a data do comando; água do processo = o dia da coleta; baias e linhas = o dia da análise. **TAB e Coliformes não entram.**
- **Padrão de escrita** (definido pelo Danyllo em 24/10; vale só para este laudo): a descrição do dia é **um texto só**, nesta ordem, grupos separados por **"; "** e **ponto no fim**: **REC** (recebimento de FCOJ) → **embarque de FCOJ** → **tanques de navio** → **tanques terra** → **água do processo** → **baias** → **linhas** → **NFC** (recebimento NFC). Grupo sem análise no dia é pulado.
  - **REC:** os loads com os lotes entre parênteses, números seguidos em faixa: `REC: 44444 (1-10, 12), 44445 (39-42)`.
  - **Embarque:** o navio com a viagem e, depois do ":", os loads com as amostras: `O.SKY-123: 43222 (A1-A5), 44323 (A1-A5)`.
  - **Tanques:** de navio pelo nome e viagem, de terra com `TQ:`. O frasco vai **no fim de cada sequência** de tanques com o mesmo frasco: `(N)`, `(ST)` ou `(N,ST)` se os dois foram feitos no dia. Ex.: `O.SKY-123: 1C, 2P, 2S, 8C (N)`; `TQ: 44, 45 (N), 46 (ST)`.
  - **Água do processo** por extenso, só os pontos coletados: `MN` (Manifold), `C4`, `C5`, `C6` (Câmaras). Ex.: `Água do processo: MN, C5, C6`.
  - **Baias / Linhas:** singular com uma amostra (`Baia: 3`), plural com mais (`Baias: 2,3,4,4,5`); os números podem repetir (mais de uma análise do mesmo ponto no dia).
  - **NFC:** o load e o lote, sem fresh/past nem diluição: `NFC: 43777 (123)`.
  - Exemplo completo: `REC: 44444 (1-10, 12), 44445 (39-42); O.SKY-123: 43222 (A1-A5), 44323 (A1-A5); O.SKY-123: 1C, 2P, 2S, 3P, 3S, 4P, 4S, 5P, 5S, 6P, 6S, 7P, 7S, 8C (N); TQ: 44, 45 (N), 46 (ST); Água do processo: MN, C5, C6; Baias: 2,3,4,4,5; Linhas: 1,2,4; NFC: 43777 (123).`
- **Meios neste laudo:** C.T. em OSA (suco, NFC, tanques e água do processo); B.L. em PDA (todos); **PCA só com baia ou linha** (a água do processo **não** usa PCA aqui; o branco do dia continua com a regra dele); **Wort só com tanque** (terra ou navio).
- **Continuação:** texto que não cabe nas 4 linhas do bloco continua no bloco de baixo, com a **mesma data, os mesmos lotes e as mesmas leituras** repetidos; o bloco nunca ganha linha a mais.
- O dia **entra na folha no dia seguinte** (quando fecha), na ordem; o lugar fica guardado (`app.incubacao_dias`) e o conteúdo é lido na hora do PDF. Na primeira vez, a folha começa uma semana antes. A tela mostra qualquer dia (hoje e os 7 anteriores): amostras, lotes, leituras e se já está na folha; meio usado sem lote marcado aparece em destaque, com o atalho para Meios e lotes.

### 7.5 Branco do dia: meio de cultura e fluxo laminar (APP-038, 24/10; migration 063)
- Um dia de análise por linha (hoje ou até 7 dias antes): capela do fluxo laminar (C.T. e B.L., UFC/50 cm²/30 min) e o controle de cada meio (OSA, PDA, Wort, PCA, UFC/ml). Tudo começa em `<1`; **Wort e PCA vêm com "-"** nos dias sem análise que os use (Wort = tanques de NFC; PCA = águas, baias e linhas), e o app diz por quê. Quem salva é o responsável. Laudo de 39 dias por folha (versão de 2024 do modelo).

### 7.4 Meios e lotes (APP-036, 23 e 24/10; migration 060)
- Cadastro de cada **lote recebido** de OSA, PDA, PCA e Wort (data, lote, estado de conservação, pH, observação). Cada meio tem **um lote em uso**, escolhido com um toque ("Usar este"); trocar fecha o período do anterior. O lote em uso **não é sempre o mais novo** e um antigo pode voltar a ser usado.
- O laudo de incubação acha **sozinho** o lote de cada dia (decidido em 24/10): vale o lote **marcado em uso** naquele dia; sem marcação que cubra o dia (ex.: antes da carga do histórico), vale o **último lote recebido até aquele dia**. Trocar o lote em uso muda o laudo a partir daquele dia, e o PDF é refeito na hora (inclusive o das folhas já montadas). Se o lote já era usado antes de ser marcado, "Já era usado antes? Corrigir a data de início" volta o início para o dia certo (não passa de hoje); marcação de outro lote que ficar dentro do período corrigido (ex.: um toque errado em "Usar este") é **anulada** (o período vira vazio, nada é apagado) e a que valia antes termina no novo início.
- Laudo "Controle de Qualidade e Aceitação de Meios de Cultura" (LAB/090): **uma folha por meio**, 33 linhas; o bloco Analista / Responsável é à mão. O histórico em papel entra **uma vez por CSV** (Admin); os números reais nunca vão para o Git.

### 7.3 Registros diários (APP-043, decidido em 24/10)
- Aba com os **laudos de rastreio** em cartões, como a aba Páginas: tocar num cartão abre o laudo para preencher. Funcionam: material asséptico, meio de cultura e fluxo laminar e meios de cultura (lotes). Incubação e leitura entrou em 24/10 (§7.6). O laudo de ciclos de esterilização fica na Esterilização. **Água do processo e limpeza de superfícies (baias e linhas) são análises: ficam na aba Páginas**, com o laudo de cada uma lá (decidido em 24/10).
- No celular, a aba fica no menu da conta (o boneco no topo) e no Turno; no computador, no menu lateral.

### 7.2 Material asséptico (APP-041, decidido em 24/10)
- **Um registro por dia de análise** (hoje ou até 7 dias antes): ponteira/pipeta, água de diluição e meio de cultura com os **ciclos de esterilização** usados, placa de Petri com os **lotes** (P pequenas, para todas as análises; G grandes, para tanques de NFC), e C.T./B.L. do controle (`<1` por padrão).
- O app **sugere** os ciclos do último dia registrado mais os esterilizados (eficientes) depois dele, e repete os lotes de placa; o analista **confirma, tira ou acrescenta livremente** (análises fora do roteiro). Os lotes das placas não têm cadastro nem laudo: são anotação livre.
- Quem salva fica como **responsável pelo preenchimento** (salvar de novo passa para o nome de quem salvou).
- **Laudo "Controle de Material Asséptico"**: 9 dias por página, Visto à mão, mesmo fluxo de impressão do laudo de esterilização. A Esterilização tem o tipo **Água de diluição** (migration 059).
- **Resultado pendente e excluir dia (APP-053, 24/10; migration 066):** C.T. e B.L. em branco ficam **pendentes** (o laudo sai com a célula vazia) e se lançam depois; o botão **"<1 em todos"** preenche os dois. **"Excluir o dia"** tira o dia do laudo (arquiva com quem, quando e o motivo; o dia pode ser lançado de novo); dia de página já impressa não se exclui (corrige-se).

### 7.1 Temperatura das estufas
- **Não ok passa para o turno seguinte** (24/10): enquanto ninguém conferir Ok, o Turno, o Início e Estufas mostram "Estufas fora da faixa" com a leitura, desde quando e a última temperatura. A conferência Ok não aparece na linha do tempo do turno.
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
- **Layout profissional (decidido pelo Danyllo em 23/10, APP-032; vale sobre a paleta de 15/10 abaixo):** o app ficava "grande demais e com cara de aplicativo". Passa a seguir o jeito dos LIMS de mercado: **menu lateral azul** (item ativo com marcador laranja), **barra branca no topo só com símbolos à direita** (engrenagem = configurações e aparência; boneco = menu da conta com nome, cargo, trocar senha e sair), **painéis com barra de título azul-escura**, **tabelas compactas** (cabeçalho cinza-azulado, linhas alternadas), **fonte menor** (13 px no computador, 14 px no celular), cantos de 4 px e sombras mínimas, fundo cinza-azulado claro (`#F2F4F7`), azul das ações `#1F6FB5`. O laranja da marca fica só como destaque. Há modo escuro (automático ou escolhido em Minha conta). **Gráficos nas telas que têm dados:** Visão geral (análises registradas por dia, em colunas, e Não ok por dia, em linha) e, acima de cada tabela com situação ou status, as barras "Por situação" (tocar numa barra filtra a tabela), além do G2 e do G4.
- **Paleta clara original** (laranja claro e creme), **aprovada pelo Danyllo em 15/10** depois de uma prévia visual com dados fictícios (fora do repositório); **substituída em 23/10 pelo layout profissional acima**, fica aqui para o histórico:

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
| `app.laudos_esterilizacao` | Páginas do laudo de esterilização (35 linhas): criada, impressa por/em |
| `app.modelos_documento` | O PDF oficial da empresa (confidencial), enviado pelo Admin |
| `app.lotes_meio` | Cada lote recebido de OSA, PDA, PCA e Wort: data, lote, conservação, pH, observação, quem; página do laudo LAB/090 |
| `app.uso_lote_meio` | O lote em uso de cada meio, com o período (de/até) e quem marcou |
| `app.coletas_agua_processo` | Coleta da água do processo: pontos coletados, C.T./B.L. de cada um, observação, quem coletou e quem lançou |
| `app.coletas_superficie` | Coleta de baia ou linha: ponto, dia da análise, C.T. 48 h, B.L. 72 h e 120 h, quem |
| `app.fluxo_laminar` | Branco do dia: capela C.T./B.L. e OSA, PDA, Wort, PCA, quem preencheu |
| `app.material_asseptico` | Um dia de análise: ciclos e lotes usados, C.T./B.L., quem preencheu, página do laudo |
| `app.paginas_laudo` | Páginas dos laudos novos (a partir do material asséptico): impressa por/em |
| `app.registros_turno` | "Atividades realizadas" escritas à mão no turno (texto até 200, quem, quando; excluir arquiva, com quem e quando) |
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

Nenhuma (16/10/2026). Pendência fora da especificação: domínio próprio antes do piloto ([06](06-api-e-auth.md)).

## Pronto quando

As perguntas acima estão respondidas, o [06](06-api-e-auth.md) e o [08](08-fluxos.md) estão revisados no mesmo nível, e o Danyllo aprova: o documento vai a `status: approved`, `version: v1.0`, e só então as telas viram tarefas (`APP-001`...), cada uma citando a seção de origem.
