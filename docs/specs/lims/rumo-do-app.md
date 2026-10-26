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

**Dois compromissos do Danyllo (21/10/2026), que valem para todas as fases:**
- **Segurança em primeiro lugar.** O medo da gestão é o dado **vazar**, **sumir** ou **se perder**. O app precisa ser seguro **no celular**, que é o aparelho de quem não tem Wi-Fi na fábrica: nada guardado no aparelho, acesso só de quem pode, na hora e no lugar certos (ver "Segurança no celular" abaixo), banco num servidor com backup fora da máquina, e nada apagado de verdade (excluir guarda o registro).
- **Automatizar os dois lados.** Não só quem **lê** os dados (páginas, gráficos, relatórios), mas principalmente quem **gera** os dados, os **analistas**: menos texto repetitivo, nada de preencher planilha ou tabela à mão; o registro sai de um toque, de uma frase, de uma foto ou de uma leitura automática, e os relatórios se montam sozinhos a partir dele.

### Segurança no celular (direção de 21/10/2026, para uma versão depois do piloto do app)
Na fábrica **não há Wi-Fi**: o celular usa dados móveis, então travar pela rede da empresa não funciona. As barreiras ficam na pessoa e no aparelho, **sempre conferidas na API** (nunca só no aparelho):
1. **Localização na hora do uso:** ao entrar e a cada registro, o servidor confere se o aparelho está dentro da área da fábrica (cadastrada pelo Admin). Fora dela, não mostra dados nem grava. Não rastreia: só confere no momento do uso.
2. **Horário do turno:** só funciona dentro do turno em que a pessoa entrou (com folga curta); fora dele, a sessão encerra.
3. **Aparelho autorizado:** celular novo só entra depois que o Admin aprova (compensa o GPS falsificado e o login emprestado).
4. **Nada guardado no aparelho:** só online, sem cópia local dos dados; ao sair ou no fim do turno não sobra nada para ver.
- **LGPD:** a localização do funcionário é dado pessoal. Antes de ligar, combinar com a gestão (e o RH, se preciso) e avisar a equipe do porquê e de que não há rastreamento.

A base já está escrita nas specs do LIMS ([00](00-visao-geral.md) a [10](10-decisoes.md)): **evoluir esses documentos, não começar outro**.

## Fase atual

**Fase C: as telas (PWA).** A Fase B terminou em 19/10/2026, com a API no ar no servidor de demonstração (só pelo Tailscale). Telas em **React + TypeScript** (decidido em 21/10); tarefas `APP-012` a `APP-028` abaixo, **aprovadas em 21/10/2026**.

| Fase | O que entrega | Situação |
|---|---|---|
| A | Spec do app revisada (07, 06, 08 e esta nota) | ✅ concluída: 06, 07 e 08 aprovados como v1.0 em 16/10/2026 |
| B | API só de leitura + login | ✅ concluída em 19/10/2026 (APP-001 a APP-011; API no ar pelo Tailscale) |
| C | PWA só leitura: painel do dia, relatório do turno, gráficos | ⏳ em andamento (tarefas `APP-012`... aprovadas em 21/10) |
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
  | Corrigir registro (coleta sem motivo; análise com motivo, 16/10) | ✅ | ✅ | ❌ | Só a própria coleta |
  | Excluir registro (confirmação; coleta sem motivo, análise com motivo; fica no histórico) | ✅ | ✅ (mudado em 15/10, à noite) | ❌ | Só a própria coleta (como no bot, 029) |
  | Adicionar pessoa, convite, senha, trocar cargo | ✅ | ❌ | ❌ | ❌ |
  | Editar os horários padrão dos turnos | ✅ | ❌ | ❌ | ❌ |

## Tarefas da Fase B (aprovadas em 17/10/2026)

Código do app no **mesmo repositório, na pasta `app/`** (`app/api/` e, na Fase C, `app/web/`), com CI próprio que só roda quando `app/` muda (decidido em 17/10). Geradas só a partir dos documentos `v1.0` ([06](06-api-e-auth.md), [07](07-app-pwa.md), [08](08-fluxos.md)), no modelo do [guia prático](guia-pratico.md). **Uma tarefa = uma branch = um PR**, com testes. Nenhuma mexe em tabela, workflow ou migration do bot. Dados sempre fictícios (`db/seeds/demo.sql`).

| # | Tarefa | Origem | O quê | Pronto quando | Depende de |
|---|---|---|---|---|---|
| APP-001 | Esqueleto da API | 06 §Arquitetura | Projeto FastAPI em `app/api/`, rota `GET /saude`, testes com `pytest`, workflow próprio no GitHub Actions (só roda quando `app/` muda) | `pytest` verde no CI; `GET /saude` responde `ok` | — |
| APP-002 | Banco de teste no CI | 06 §Arquitetura (testes desde o primeiro endpoint) | No CI, um PostgreSQL de teste recebe as migrations `001`–`029` e o `demo.sql`; a API conecta por variável de ambiente (nunca senha no repositório) | Um teste lê `usuarios` do banco de teste e passa | APP-001 |
| APP-003 | Migration `050_app_login` | 06 §Tabelas do login; rumo §Regras | Schema `app` com `credenciais`, `senhas_provisorias`, `sessoes`; usuário de banco `labflow_app_web` (lê as views e tabelas do bot, escreve só no schema `app`); arquivo `050_desfazer.sql` | Aplica, desfaz e reaplica no banco de teste; teste prova que `labflow_app_web` **não** consegue gravar em tabela do bot | APP-002 |
| APP-004 | Login e sessão | 06 §Primeiro acesso; 08 A1 | `POST /login` (usuário curto + senha, argon2), cookie seguro, `POST /sair`, `GET /me` (nome e cargo); sessão até "Sair" ou 30 dias sem uso; bloqueio de 15 min após 5 erros | Testes: login certo, errado, bloqueio, sessão vencida, sair | APP-003 |
| APP-005 | Permissão por cargo | 06 §Arquitetura; 07 §Permissões | Uma checagem única que lê o cargo em `usuarios` **a cada chamada** (Admin, Operador, Consultor, Coletor) | Teste com os 4 cargos; trocar o cargo no banco vale na chamada seguinte | APP-004 |
| APP-006 | Senha provisória | 06 §Primeiro acesso; 08 A1 | Admin gera senha provisória (24 h, uso único) para uma pessoa já cadastrada; no primeiro login a troca é obrigatória; senha igual ao usuário é recusada | Testes do fluxo A1 inteiro, inclusive provisória vencida e já usada | APP-005 |
| APP-007 | Pessoas (leitura) | 07 §10 Admin | `GET /admin/pessoas`: nome, usuário curto, cargo, situação (ativo, senha provisória pendente, bloqueado); Admin define o usuário curto de quem já existe | Só Admin acessa (teste com os outros cargos) | APP-006 |
| APP-008 | Páginas Coletas e Recebimento (leitura) | 07 §5; 08 A11 | Rotas de leitura **por views**, com filtros (período, tanque, navio, load, lote, fábrica, quem fez, situação) e paginação; Coletas mostra quem coletou e quem digitou | Os números batem com as views `bi.*` no banco de teste | APP-005 |
| APP-009 | Exportar para Excel | 07 §5; 08 A11 | `.xlsx` do que está filtrado nas duas páginas, para todos os cargos que veem a página | Teste abre o arquivo gerado e confere as linhas | APP-008 |
| APP-010 | Pendências de hoje | 07 §3; 06 §Primeiros endpoints | `GET /pendencias-hoje` (vence hoje e atrasados), lendo as views de previstas | Bate com o que o `relatório do dia` do bot mostraria no banco de teste | APP-005 |
| APP-011 | Container e acesso por Tailscale | 06 §Arquitetura | Container `labflow-api` na stack do servidor de demonstração, sem porta pública; passo a passo para o Danyllo acessar `/docs` pelo Tailscale | O Danyllo abre `/docs` no navegador e faz login com um usuário fictício | APP-004 |

**Andamento (19/10/2026):** **Fase B concluída**: APP-001 a APP-011 mescladas (#95, #97, #98, #100, #104, #106, #109, #113, #115, #124, #126) e a API **no ar** no servidor de demonstração, só pelo Tailscale (passo a passo em `app/api/deploy/README.md`). Próximo: 051 + Nova pessoa e trocar cargo (quando o PB5 for publicado) e a Fase C.

**Fica para depois da Fase B:** cadastrar pessoa e trocar cargo pelo app (dependem do PB5 publicado, PR #84 do bot); as outras páginas; turno, estufas, esterilização e relatório do turno (Fase C); editar e excluir (dependem do PB4); assistente (Fase D, PB6).

## Tarefas da Fase C (aprovadas em 21/10/2026)

Telas em **React + TypeScript (Vite)** na pasta `app/web/`, **servidas pela própria API** (um container só, o mesmo endereço do Tailscale, o cookie de login funciona sem configuração extra). Geradas a partir do [07](07-app-pwa.md) e do [08](08-fluxos.md) v1.0. **Uma tarefa = uma branch = um PR**, com testes (Vitest nas telas; pytest na API) e o CI do app construindo tudo. Dados sempre fictícios.

**Como cada tela se comporta** (vale para todas): paleta e visual do [07 §Visual](07-app-pwa.md); menu lateral no computador e barra embaixo no celular; tabelas viram cartões no celular; **sem emoji**; **nada de dado guardado no aparelho** (o app instalado guarda só os arquivos das telas, nunca os dados: é a base da "segurança no celular"); faixa **"Dados de demonstração"** no topo enquanto o servidor for de demonstração; as páginas **se atualizam sozinhas a cada minuto** (o "ao vivo" instantâneo fica para a Fase D, junto com o assistente).

**Marco 1: usar o app no celular, só leitura** (o que a API já tem)

| # | Tarefa | Origem | O quê | Pronto quando | Depende de |
|---|---|---|---|---|---|
| APP-012 | Esqueleto das telas e PWA | 07 §Direção, §Visual | Projeto em `app/web/`; paleta e layout (menu lateral / barra embaixo); app **instalável** (ícone na tela inicial) guardando só os arquivos das telas; a API entrega as telas no mesmo endereço; o CI testa e monta tudo; o container passa a levar as telas | Abre pelo Tailscale no celular e no computador; "Adicionar à tela inicial" funciona; CI verde | — |
| APP-013 | Login, troca de senha e sair | 07 §1; 06 §Primeiro acesso | Tela de login (botão **Entrar travado** enquanto espera a resposta), troca obrigatória da senha provisória, mensagens de bloqueio, "Sair" | Testes: login certo, errado, bloqueado, senha provisória até a troca | APP-012 |
| APP-014 | Início em leitura | 07 §3 | Cartões **Para hoje**, **Atrasados** e **Desvios abertos**; pendências de hoje por bloco, compactas | Os números batem com `GET /pendencias-hoje` no banco de teste | APP-013 |
| APP-015 | Coletas e Recebimento na tela | 07 §5; 08 A11 | Filtros com etiquetas removíveis, tabela (cartões no celular), paginação, **Exportar Excel** e **Imprimir só o filtrado** (A4 em pé ou deitado, título, filtros e "página 1 de N") | Mesmas linhas da API; impressão legível em preto e branco | APP-013 |
| APP-016 | Admin → Pessoas completo | 07 §10; 06 §Primeiro acesso | Migration **051** (`GRANT EXECUTE` das funções do PB5 ao `labflow_app_web`, com desfazer); rotas **Nova pessoa** (cadastrar + usuário curto + senha provisória numa confirmação só) e **trocar cargo**, pelas funções `cadastrar_usuario` e `trocar_cargo` do bot; tela com a lista, situação, usuário curto, gerar senha provisória, Nova pessoa e trocar cargo | Quem é cadastrado pelo app é reconhecido no bot; só o Admin vê o menu e a rota; testes no banco de teste | APP-013 |

**Marco 2: todas as páginas do Power BI em leitura**

| # | Tarefa | Origem | O quê | Pronto quando | Depende de |
|---|---|---|---|---|---|
| APP-017 | API: Tanques, Drops e Desvios | 07 §5 | Leitura pelas views `bi.*`, filtros, paginação e Excel, como em Coletas | Números batem com as views no banco de teste | — |
| APP-018 | API: Embarque, TAB e Coliformes, Recebimento NFC, Navios e Visão geral | 07 §5 | O mesmo para as outras páginas; **Navios** (nova) por navio e viagem: coletados, analisados, pendentes, desvios | Idem | — |
| APP-019 | Telas das páginas do APP-017 e APP-018 | 07 §5 | O mesmo padrão do APP-015 em todas | Cada página filtra, imprime e exporta | APP-015, APP-017, APP-018 |
| APP-020 | Gráfico G2 | 07 §6 | C.T e B.L por load ao longo do tempo, com a **linha do limite** (lida da tabela de limites; no repositório, só os fictícios); acima do limite em vermelho com "Não ok"; tocar num ponto filtra a tabela | Responde ao filtro da página; não ok nunca só pela cor | APP-015 |

**Marco 3: o turno**

| # | Tarefa | Origem | O quê | Pronto quando | Depende de |
|---|---|---|---|---|---|
| APP-021 | Migration do turno | 07 §Tabelas do app | `app.turnos`, `app.entradas_turno`, `app.relatorios_turno`, `app.atividades_fixas`, `app.atividades_feitas` (próximo número livre da faixa 050–099), com o arquivo de desfazer e a lista de atividades fixas do 07 | Testada numa transação desfeita (regra do `CLAUDE.md`); CI desfaz e reaplica | — |
| APP-022 | Entrar e sair do turno | 07 §2; 08 | Escolher Manhã, Tarde ou Madrugada (sugestão pelo horário), editar o próprio horário, "Sair do turno"; cartão **Feito no turno** no Início | Testes de permissão (Consultor não entra) e da Madrugada contando no dia em que começou | APP-021, APP-014 |
| APP-023 | Atividades fixas no Início | 07 §3 | Lista do turno com **Feito** e **Não feito** (grava quem e quando); item com dia certo ("só às sextas") só nesse dia | Não feito vira pendência do próximo turno | APP-022 |
| APP-024 | Relatório do turno | 07 §4 | Página compartilhada: analistas, análises feitas e pendentes (automático), **Adiantado pelo Admin**, campos escritos à mão, ocorrências, imprimir | Um registro cai no turno certo pela hora e por quem gravou | APP-022 |
| APP-025 | Encerrar o turno | 07 §4 | "Encerrar turno" pela última pessoa (mostra o que passa adiante), pendências herdadas no próximo turno, encerramento automático e **reabrir com motivo** (Admin) | Encerrado fica só leitura | APP-024 |

**Marco 4: esterilização, estufas e Admin**

| # | Tarefa | Origem | O quê | Pronto quando | Depende de |
|---|---|---|---|---|---|
| APP-026 | Esterilização | 07 §7, §6 | Tabela `app.esterilizacoes`, botões **Ponteira, Meio, Frasco, Descarte, Outro**, número do ciclo, lista do turno e o **gráfico G4** | Aparece no relatório do turno | APP-024 |
| APP-027 | Estufas | 07 §7.1 | Tabelas `app.estufas` e `app.leituras_estufa`; as 11 estufas com **Supervisório** e **Field chart** (Ok / Não ok, temperatura só no Não ok), bloco no Início e aba própria; faixas **fictícias** no repositório | Estufa Não ok entra nas ocorrências do relatório do turno | APP-024 |
| APP-028 | Admin: turnos, atividades e estufas | 07 §10 | Horários padrão dos turnos, atividades fixas de cada turno, estufas e faixas (as reais só no banco) | Só o Admin acessa | APP-023, APP-027 |

**Andamento (22/10/2026):** Marco 1 completo e no ar (APP-012 a APP-016, #147 a #153; migration 051 aplicada em 21/10). Marco 2: APP-017, APP-018 e APP-019 mescladas (#158, #159, #160: todas as páginas do Power BI no app); APP-020 (gráfico G2) mesclada (#162): **Marco 2 completo e no ar** (atualizado no servidor em 23/10, ~00:30, sem migration). APP-019b (Tanques terra e Navios com status e a página de cada um) mesclada (#167) e no ar em 23/10, sem migration. Marco 3 começou: APP-021 (migration 052) mesclada (#165); APP-022 (entrar e sair do turno, cartão Feito no turno) no ar com a 052 (#169, #174, #177); APP-022b (check-in obrigatório para Analista e Coletor, hora do toque, correção com motivo, migration 053) mesclada (#179, #180); APP-023 (atividades fixas no Início) e APP-024 (relatório do turno) e APP-025 (encerrar o turno) e APP-026 (esterilização, migration 054) e APP-027 (estufas, migration 055) e APP-028 (Admin de turnos, atividades e estufas) em PR: com elas o **Marco 4** fica completo. APP-029 (corrigir, excluir e recuperar coleta pelo app, migration 056). **Marcos 3 e 4 completos e no ar em 23/10 (~13:00)**, com as migrations 053 a 056.

**Acabamento visual: primeira rodada feita e no ar em 23/10 (APP-030, #196):** ícones no menu, profundidade, etiquetas legíveis, botões e tabelas com estados. Segunda rodada (APP-031): **modo escuro** (automático ou escolhido em Minha conta) e gráficos G2 e G4 refinados. **Layout profissional (APP-032, 23/10):** menu azul, topo com símbolos, painéis com barra de título, tabelas compactas, fonte menor, gráficos na Visão geral e barras por situação nas páginas. Falta, se quiser: a tela de entrar no mesmo acabamento. **Turno como central (APP-033, 23/10; migration 057):** equipe do turno e chip no topo, estufas, análises a fazer, linha do tempo "quem fez o quê" e "Atividades realizadas" livres, ligadas ao relatório do turno. **Laudo de esterilização (APP-035, migration 058):** o app preenche o PDF oficial do laudo de ciclos (35 linhas por página, pendente de imprimir → impresso → arquivo); pedido futuro ao bot: registrar esterilização por frase.

**Acabamento visual (combinado em 22/10):** o Danyllo achou as cores "cruas". Fica para uma etapa própria, **depois de os marcos funcionarem**: revisar de uma vez cores, contraste, espaçamento e tamanhos em todas as telas (celular e computador), mantendo a paleta aprovada em 15/10 (07 §Visual) e sem emoji.

**Fica fora da Fase C:** relatório do dia igual ao do bot (depende do PB6, Fase D); assistente (Fase D); editar e excluir (dependem do PB4); barreiras de segurança no celular (versão depois do piloto do app).

## Decisões em aberto (perguntar, não decidir sozinho)

- **Quando ligar as barreiras de segurança no celular** (localização, horário, aparelho autorizado) e quem da gestão aprova o uso da localização (LGPD).

## Laudos automáticos (objetivo principal, decidido em 23/10/2026)

**Objetivo:** tudo o que se registra no app, no assistente ou no bot preenche **sozinho** os laudos oficiais do laboratório (os PDFs do SGI da empresa); quando a página enche, fica "pendente de imprimir" e só se imprime e assina. É o que faz do LabFlow um LIMS de verdade. **Regras comuns:** o PDF oficial é **confidencial** e fica no banco (`app.modelos_documento`, enviado pelo Admin), nunca no Git; o app escreve nas células do próprio PDF; o **nome do analista** sai de quem registrou; **Visto, RCA e Responsável pela Correta Aplicação ficam em branco** (assinatura à mão); páginas de N linhas: pendente de imprimir → impressa → arquivo, com reimpressão. O motor nasceu no laudo de esterilização (APP-035) e será reaproveitado nos outros.

| Laudo (SGI) | Uma linha é | De onde vem | O que falta | Situação |
|---|---|---|---|---|
| **Controle de Ciclos de Esterilização** (LAB/001) | um ciclo num dia | tela Esterilização | — | **no ar em 23/10** (APP-035) |
| **Controle de Incubação e Leitura** (LAB/001) | um **dia de incubação**: a descrição das amostras (Recebimento com load e lotes, Concentrado, Embarque, Tanques com N/ST, NFC com load e frasco, Linhas, Baias, Água do processo), os **lotes dos meios** OSA, PDA, PCA e Wort, a data da incubação e as datas de leitura (OSA/PCA 48 h, PDA 72 h e 120 h, Wort 240 h) | coletas e análises do bot (`bi.*`) + as análises novas abaixo; **TAB e Coliformes não entram** | **lotes dos meios** (o app não guarda ainda: tabela nova com vigência, o analista troca quando abre lote novo); **qual meio cada análise usa** (regra a confirmar com o Danyllo); qual data é a "incubação" de cada análise; "-" quando o meio não foi usado no dia | **feito em 24/10** (APP-040, migration 065, lendo a `bi.incubacao` da 038 do bot) |
| **Análise Microbiológica da Água do Processo** (FAB/028, unidade do terminal) | uma coleta (data e hora) | **análise nova** | C.T. e B.L. de 4 pontos (Manifold, Câmara 4, 5 e 6); "-" = ponto não coletado; Observação (ex.: "Esterilizando"); Analista = quem registrou; RCA à mão. O modelo recebido é uma **folha digitalizada** (imagem, tabela deitada na página): as células serão medidas na imagem e o texto escrito girado | **no ar em 24/10** (migration 061; o bot registra por frase desde a 049) |
| **Controle de Qualidade e Aceitação de Meios de Cultura** (LAB/090) | um **recebimento de lote**: data do recebimento, meio, número do lote, estado de conservação, pH, observação; **uma folha por meio** (OSA, PDA, PCA, Wort) | tela nova **Meios e lotes** | o cadastro dos lotes (33 linhas por folha); o modelo chegou em Word (.doc): vira PDF para o Admin enviar; o **histórico de lotes já usados** pode ser carregado no servidor por um arquivo fora do Git | **no ar em 24/10** (migration 060, com o histórico de lotes importado) |
| **Controle de Meio de Cultura / Fluxo Laminar** (LAB/001) | um **dia de análise**: capela do fluxo laminar (C.T. e B.L., UFC/50 cm²/30 min) e controle de cada meio em uso (OSA, PDA, Wort, PCA, UFC/ml); Analista = quem registrou | **análise nova** (diária) | a análise e o laudo. É o **branco**: placas só com o meio em uso (sem amostra) e da capela, para ver se algo cresceu (o normal é `<1`); a capela tem duas placas por meio (`<1\|<1`). Vale a **versão mais nova** do modelo (LAB/001 de 2024, capela em UFC/50 cm², colunas OSA, PDA, Wort e PCA; decidido em 24/10). Mesma regra do laudo de incubação: **Wort e PCA com "-"** nos dias sem análise que use esses meios | **no ar em 24/10** (branco do dia, migration 063) |
| **Controle de Material Asséptico** (LAB/001) | um **dia de análise**, com 4 materiais: ponteira/pipeta, água de diluição, placa de Petri e meio de cultura; C.T. e B.L. (`<1`); Analista; e, para cada material, **o que foi usado no dia**: os **ciclos de esterilização** (ponteiras, água de diluição, meios) e os **lotes das placas** (P = pequenas, para todas as análises; G = grandes, só para tanques de NFC, terra ou navio) | Esterilização (APP-035) + o que o analista marcar (os **lotes das placas são livres**: não há laudo nem cadastro deles, só se anotam aqui) | o app **sugere** os ciclos do dia e repete os lotes de placa anotados por último (só como sugestão) e o analista **confirma ou acrescenta livremente** (análises fora do roteiro usam outro meio, outra placa ou água para diluir algo); quem marca fica registrado como responsável pelo preenchimento; tipo **"Água de diluição"** na tela Esterilização (hoje entra como Outro); modelo em PDF exportado do Word (convertido fora do Word, a folha vira 2 páginas) | **no ar em 24/10** (APP-041, migrations 059 e 066) |
| **Limpeza de Superfícies** (LAB/001) | uma coleta: data, hora, ponto | **análises novas**: **Baias** (CIP dos mangotes do recebimento) e **Linhas** (CIP das linhas de embarque) | C.T. 48 h, B.L. 72 h e 120 h; Observação "Análise dd.mm.aa" (dia em que foi plaqueada); folhas separadas para baias e para linhas | **no ar em 24/10** (migration 062); **baias e linhas são análise** (25/10): só Admin e Analista (072 no app, 100 no bot) |
| **Análises Microbiológicas – Recebimento** (LAB/001) do **Recebimento NFC** | um lote (como no papel que o bot lê pela foto) | `recebimento_nfc` e `contagens_nfc` do bot (`vw_contagens_nfc`, `bi.recebimento_nfc`) | **o mesmo modelo do recebimento de FCOJ** (o título do papel é só "Recebimento"; decidido pelo Danyllo em 25/10): o que diferencia é o **item 129**. Load, Fábrica, Item 129, Lote, Data da análise (a de cada linha), C.T. 48 h, B.L. 72 h e 120 h **como lidos na placa** (o multiplicado fica no banco) e na Observação o tipo e a diluição (`past 10¹`, `fresh 10³`); folhas próprias do item 129 (sem misturar com o FCOJ). Preenche a cada lançamento | **feito em 25/10** (migration **073**, aba Laudo do app Recebimento NFC; usa o modelo já enviado do FCOJ) (o modelo já está no app, APP-059) |
| **Análises Microbiológica de NFC** (LAB/001, folha deitada) | uma **coleta de tanque** (Coleta, Análise, Amostras; resultados do frasco Normal e, à direita, do **Stress** com a própria data de análise) | `analises` e `leituras_placas` do bot (`bi.leituras_nfc`, `bi.placas_nfc`) | **um laudo para tanque de terra e navio** (25/10): no "Nº do Tanque" vai o número do tanque de terra ou o **nome do navio**. Colunas: C.T. 48 h, B.L. Profundidade 120 h, B.L. Superfície 120 h, Psicrotróficos (Wort) Profundidade e Superfície 240 h, e o mesmo bloco no Stress. Decidido pelo Danyllo (25/10): em **"Amostras"** vai o número do tanque (terra) ou a **letra e número do tanque do navio** (`1C`, `2P`, `3S`); as placas vão em **triplicata** na célula (`<1\|<1\|2`, como o bot lê pela foto do mesmo laudo: `docs/comandos.md`, seção 15.3, e a foto de NFC com as 3 placas por leitura); **B.L. Superfície = "-"** (o bot não registra); Psicrotróficos = Wort (profundidade e superfície, leitura final) | **feito em 26/10** (migration 076; aba Laudo do app; o Admin envia o PDF do modelo na aba) |
| **Análises Microbiológicas – Embarque** (LAB/001, deitada) | uma amostra do embarque | `embarques`, `embarque_amostras`, `embarque_loads` e as contagens do bot | cabeçalho **Navio** (nome) e **Embarque = a viagem** (`O.SKY 123` → `123`; decidido em 25/10); Data da análise, Linha/Fase, Load (com vários loads, `43783/43784`, PB19), Número da amostra, C.T. 48 h, B.L. 72 h e 120 h, Observação; um laudo por navio | **feito em 26/10** (migration 076; aba Laudo do app; o Admin envia o PDF do modelo na aba) |
| **TAB – Método II (IFU 2019)** (LAB/001) | uma composta ou um tanque com TAB | `testes` (tipo TAB) e `vw_compostas` | Data da análise no cabeçalho (uma folha por dia de análise), Amostra (`#N lotes 1-5` ou tanque), Item, Fábrica, Resultado TAB: **`+` só depois de confirmado positivo** e `-` quando negativo; o TAB **em confirmação** (no PCA) sai escrito **"aguardando confirmação"** e a folha fica incompleta: na hora de imprimir, o app avisa e oferece **confirmar o TAB** ali mesmo (`teste_acao`, a mesma da confirmação do bot). Guaiacol em branco (o bot não registra); Observação (decidido em 25/10) | **feito em 26/10** (migration 076; aba Laudo do app; o Admin envia o PDF do modelo na aba) |
| **Coliformes em suco** (LAB/001) | um teste de Coliformes (composta do recebimento ou do embarque) | `testes` (tipo COLIFORMES), `vw_compostas` | Data/Hora, Amostra (load e lotes, ou navio/linha/fase), Coliformes Totais (presença/ausência), **E. coli = "-"** (o bot não registra; decidido em 25/10), Observação | **feito em 26/10** (migration 076; aba Laudo do app; o Admin envia o PDF do modelo na aba) |
| **Contagem de bolores (câmara Howard)** (LAB/001) | uma amostra (5 blocos por folha) | `testes` (tipo HOWARD, percentual em 50 campos) | Amostra, Data, Nº de campos positivos (= percentual × 50 ÷ 100) e Howard (%); as grades #1, #2 e #3 ficam em branco (o bot guarda só o percentual) | **feito em 26/10** (migration 076; aba Laudo do app; o Admin envia o PDF do modelo na aba) |
| **Controle de Contra Amostra – Embarque** (LAB/012) e **– Load (Recebimento)** | uma caixa de navio (loads de FCOJ com a quantidade e potes de NFC; o navio em letra grande na Observação) / uma folha corrida do recebimento (caixa, load, lotes) | `vw_arquivo_itens` (105) | data de descarte `dd/mm/aaaa`; lotes como `12-24,27` | **feito em 26/10** (migration 076; página Arquivo, abas Navios e Recebimento). Bags dos tanques de terra: **sem modelo** (não há laudo em papel) |
| Drops e estufas | — | — | **não têm laudo** (Danyllo, 25/10) | — |

**Meios e tempos de leitura** (resumo das regras do método de análises microbiológicas da empresa, lido em 23/10; o documento em si não vai para o repositório). Conferido com duas folhas de "Controle de Incubação e Leitura" preenchidas à mão: bate em todas as linhas.

| Meio | Análise | Onde se usa | Incubação | Coluna no laudo de incubação |
|---|---|---|---|---|
| **OSA** (ágar soro de laranja) | **C.T.** (contagem total de mesófilos acidúricos) | suco concentrado (recebimento, concentrado, embarque), polpa e NFC (tanque, navio, carreta) | 30 °C, 48 h | OSA/PCA 48 h (incubação + 2 dias) |
| **PDA** (acidificado) | **B.L.** (bolores e leveduras) | as mesmas amostras do OSA e as águas | 25 °C, 120 h (pré-leitura em 72 h) | PDA 72 h (+3 dias) e 120 h (+5 dias) |
| **PCA** | **C.T. das águas** (bactérias heterotróficas: água do processo, baias e linhas) | só nos dias com água | 35 °C, 48 h | OSA/PCA 48 h; **no laudo de incubação, só com baia ou linha** (a água do processo não usa PCA nele; decidido em 24/10) |
| **Wort** | fungos psicrotróficos | só **tanques de NFC** (TQ) | 7 °C, 240 h | Wort 240 h (+10 dias); "-" nos dias sem tanque |

- **TAB e Coliformes** usam outros meios (YSG/BAT, UPEB/cromogênico) e **não entram** no laudo de incubação.
- **TQ (N) e (ST):** (N) é plaqueado direto; (ST) é o **teste de stress** (o frasco fica um tempo a 30 °C antes de plaquear). **Não é sempre 24 h depois** (decidido em 24/10): cada frasco fica com a data que o analista disser no comando de análise (`data_analise`), e o laudo usa essa data, sem somar dia.
- **Padrão de escrita do laudo de incubação** (Danyllo, 24/10): um texto por dia, na ordem REC → embarque de FCOJ → tanques de navio → tanques terra (`TQ:`) → água do processo (`MN, C4, C5, C6`) → baias → linhas → NFC, grupos separados por "; " e ponto no fim; lotes entre parênteses; o frasco `(N)`, `(ST)` ou `(N,ST)` no fim de cada sequência de tanques; texto que não cabe continua no bloco de baixo repetindo data, lotes e leituras. Detalhe e exemplo completo em 07 §7.6.
- **Resultado sem crescimento:** "<1" quando não há diluição (água, NFC direto); com diluição 1:10 o limite é "<10" (concentrado). "-" no laudo de água = ponto não coletado.
- **Data da incubação** = dia em que a amostra foi plaqueada (não o da coleta, quando diferem).
- **Lote em uso (decidido em 23/10):** na tela Meios e lotes, cada meio tem **um lote em uso**, escolhido com um toque; trocar guarda o período em que o anterior foi usado (de/até). O lote em uso **não é sempre o mais novo**: um lote recebido pode ficar guardado, e um lote antigo pode **voltar a ser usado** (o mesmo número chega de novo ou se volta ao estoque anterior), por isso escolher um lote do histórico é permitido. O laudo de incubação de cada dia usa o lote que estava em uso **naquele dia**, então trocar hoje não muda o que já foi impresso. Os lotes fora de uso ficam só como histórico.

**Ordem para não pular etapas (combinada em 24/10).** Cada passo só começa quando o anterior está no ar, porque o seguinte usa o que ele cria.

| # | Passo | Sessão | Depende de | Por que nesta ordem |
|---|---|---|---|---|
| 0 | Publicar APP-032 a APP-035 (migrations **057** e **058**); o Admin envia o PDF do laudo de esterilização e testa um ciclo | app | — | tudo abaixo usa o motor de laudos do APP-035 |
| 1 | **Meios e lotes** (APP-036, **feito em 24/10**, migration 060): cadastro do recebimento de lote (meios OSA, PDA, PCA e Wort), **lote em uso** com período (de/até), voltar a um lote antigo, carga do histórico por arquivo fora do Git, laudo LAB/090 (uma folha por meio) | app | 0 | os laudos de incubação e do fluxo laminar precisam saber o lote em uso em cada dia |
| 1b | **Material asséptico** (APP-041, **feito em 24/10**, migration 059; células medidas no PDF oficial): uso do dia (ciclos sugeridos e livres; lotes das placas digitados livremente), C.T./B.L. e o laudo; tipo "Água de diluição" na Esterilização | app | 0 | é o rastreio do que foi usado em cada análise: se algo der errado, acha-se o ciclo e o lote do dia |
| 2 | **Análises novas** (APP-037, **feito em 24/10**, migrations 061 e 062), na **aba Páginas** (são análises, não registros diários; 24/10): água do processo (Manifold, Câmaras 4, 5 e 6), **baias** e **linhas**: coleta (data e hora), leituras C.T. 48 h e B.L. 72 h/120 h, `<1`, "-" não coletado, pendências no Início e no Turno | app | 0 | os laudos de água e de superfícies só existem com essas análises |
| 3 | **Branco do dia** (APP-038, **feito em 24/10**, migration 063): controle de meio e fluxo laminar, uma linha por dia, `<1` por padrão, "-" no meio que não teve análise | app | 1, 2 | precisa dos meios em uso e de saber quais análises houve no dia |
| 4 | **Laudos só do app** (APP-039, **feito em 24/10** junto com os passos 1 a 3, no motor comum `laudos.py`): água do processo (modelo digitalizado: medir as células na imagem), limpeza de superfícies (folhas de baias e de linhas), fluxo laminar | app | 2, 3 | reaproveita o motor do APP-035 |
| 5 | **Laudo de incubação e leitura** (APP-040, **feito em 24/10**, migration 065): um dia de incubação por linha, juntando recebimento, concentrado, embarque, tanques (N/ST), NFC, águas, baias e linhas, com os lotes em uso e as datas de leitura | app | 1, 2 e **PB10** | é o único que junta dados do bot e do app |
| 6 | Bot e assistente registrando tudo por frase (PB8, PB9) e o assistente no app (PB6) | bot | 0, 2 | o bot grava pelas funções do banco que o app cria nos passos 0 e 2 |

**Passos para a sessão do bot, nesta ordem** (cada um vira PR do bot; a função do banco que grava nas tabelas do app é criada pela sessão do app, na migration do passo correspondente, e o bot só a chama):
1. **PB10 primeiro (só conferir, sem mudar nada no ar):** cada análise que o bot grava (recebimento, concentrado, embarque, tanques, NFC) tem a **data em que foi plaqueada** (incubação) e, nos tanques, se é **(N) ou (ST)**? Responder no rumo; se faltar, propor a migration na faixa do bot. É o que o laudo de incubação (passo 5) precisa.
2. **PB8** depois do passo 0 no ar: esterilização por frase.
3. **PB9** depois do passo 2 no ar: água do processo, baias e linhas por frase.
4. **PB6** (assistente do app pelo mesmo workflow) quando a Fase D começar.

## Fase E: o app faz tudo o que o bot faz (apps por análise, pedido de 24/10/2026)

**O pedido do Danyllo:** o app tem que conseguir fazer **tudo o que o bot faz**, só clicando e digitando, e o que se registra já vai para a folha do laudo (ninguém escreve à mão; quando a folha enche, imprime). A aba Páginas vira a tela de **"apps"**: cada análise é um app (ícone, nome e um número vermelho com o que está atrasado). Tocar num app **sobe um menu** com as partes dele: **Registrar** (o primeiro dia, ex.: o cadastro do recebimento), **Resultados**, **Painel** (o essencial: o que está atrasado e o que deu não ok, por fábrica e por load), **Laudo**, **Instrução** da análise e, depois, um **Vídeo** de como se faz. No topo, uma **busca** ("load, lote, tanque, navio, composta...") com o **ícone de filtro** ao lado: digitar já mostra o que interessa, sem abrir o filtro; o filtro fica para quando quiser escolher colunas. Desenho no canvas de design do Danyllo ("Apps do LabFlow": apps no celular, no computador e a página do Recebimento FCOJ com as abas).

**Regra para não duplicar:** cada coisa que o bot grava passa a ter **uma função do banco** (como o PB4, o PB5 e a 067); o bot e o app chamam a mesma função, com a mesma conferência de cargo e as mesmas mensagens. As tabelas do bot são da sessão do bot: as funções delas vêm como pedidos (PB11 em diante, abaixo); as telas são do app.

**O que o bot faz × o que o app já faz** (fonte: `docs/comandos.md`):

| Análise (app) | O bot faz | O app já faz | Falta no app | Função do banco |
|---|---|---|---|---|
| Recebimento FCOJ | registrar load/lotes, C.T/B.L por lote (`=`, `<`, `>`), alarme, corrigir/apagar | corrigir e excluir lote e load (064) | **registrar** o recebimento e **lançar** C.T/B.L | PB11 |
| Embarque FCOJ | registrar navio/linha/fase/amostras, compostas, C.T/B.L, Howard | ver | registrar, compostas, resultados | PB12 |
| Compostas, TAB, Coliformes, Howard | compostas `#N`, caldo, espalhar, ler, confirmar (lote a lote), Howard em 50 campos, "todos de uma vez" | ver (páginas separadas) | cada etapa por botão, em lote com um "sim" | PB13 |
| Tanques terra e navios | coleta (até 8/16, `coletado por`), análise N/ST (CT, BL, WORT), pré-leitura e leitura final com placas, bag/pote | corrigir e excluir coleta | registrar coleta e análise, lançar leituras e placas | PB14 |
| Drops | concluir D5/D10/D15, desvio de drop (7/13/25 °C) | ver | concluir e abrir desvio | PB15 |
| Recebimento NFC | registrar fresh/past e diluição, C.T/B.L multiplicados | ver | registrar e lançar | PB16 |
| Desvios | desvio de tanque e repetição com o frasco de arquivo | ver | abrir e lançar repetição | PB17 |
| Água do processo, baias, linhas, esterilização, estufas, material asséptico, meios, branco do dia, incubação | (PB8 e PB9 a fazer) | **tudo** | — | 067 (app) |
| Relatório do dia, leitura do dia finalizada | sim | relatório do turno | "leitura do dia finalizada" | PB17 |

**Ordem proposta** (o Danyllo escolhe; cada passo é um PR e só entra no ar com o pedido dele):
1. **E1, a tela de apps** (só app, sem mudar o banco): Páginas vira a grade de apps com o número de atrasados, o menu que sobe ao tocar, e a **busca com filtro** no topo de cada página. Os apps que já existem abrem as telas de hoje.
2. **E2, Recebimento FCOJ completo** (depende do PB11): a página com as abas Painel, Registrar, Resultados e Laudo. É o modelo para as outras.
3. **E3 a E7**: Tanques e navios (PB14), TAB/Coliformes/compostas (PB13), Drops (PB15), Embarque (PB12), NFC recebido (PB16), Desvios (PB17), nessa ordem ou na que o Danyllo preferir. **Feitos em 24/10** (APP-061, um PR só, E3 a E8 com Desvios e a leitura do dia); E1 e E2 também (#253).
4. **E8, Instrução e vídeo** (só app): uma tabela com o texto da instrução de cada análise, **enviado pelo Admin e guardado no banco** (o método da empresa não vai para o repositório), e o link do vídeo quando houver. **Feito em 24/10** (APP-062, migration 071: `app.instrucoes`, uma versão por gravação; abas Instrução e Vídeo em todos os apps); falta o Admin escrever cada instrução.

## Pedidos para a sessão do bot

O app não mexe nas tabelas nem no workflow do bot: o que ele precisa vira pedido aqui, e a sessão do bot decide como e quando fazer.

| # | Pedido | Por quê | Situação |
|---|---|---|---|
| PB1 | **Toda leitura, análise e registro com a hora** em que foi feito. Hoje falta em `analises`: a pré-leitura e a leitura final guardam só quem (`pre_leitura_por`, `leitura_final_por`), sem a hora. Sugestão: colunas `pre_leitura_em` e `leitura_final_em` numa migration do bot (028/029), preenchidas pelo workflow | O relatório do turno precisa saber em qual turno cada coisa foi feita (rastreio) | **No ar em 21/10/2026** (migration `030_hora_leituras`: colunas `pre_leitura_em` e `leitura_final_em` preenchidas por gatilho no banco e `lida_em` em `bi.leituras_nfc`; leituras antigas ficam sem hora). Pedido de 15/10, autorizado pelo Danyllo |
| PB2 | Cargo **Coletor** (só registra coletas) na tabela `usuarios` e nas permissões do bot | Novo perfil previsto; o bot e o app precisam do mesmo cargo | **Atendido** pela sessão do bot (migration `029_cargo_coletor`, 15/10/2026): Coletor registra coleta e corrige/apaga a própria coleta |
| PB4 | **Funções do banco para editar e excluir** (ex.: `excluir_coleta(id, quem, motivo)`, `corrigir_recebimento(...)`), usadas pelo app e pelo bot; começar por **Coletas** e **Recebimento**. Excluir **guarda** o registro como excluído (não apaga de vez) | Decisão de 15/10 (opção A): a regra mora num lugar só | **Coletas:** feito (033 e 034, no ar em 21/10; o app usa desde a 056). **Recebimento:** feito pela sessão do bot em 23/10 (migration **036**: `corrigir_recebimento(lote_id, campos, quem, motivo)` com `lote`/`data_recebimento`, `corrigir_load(load_id, campos, quem, motivo)` com `numero`/`item`/`fabrica`, `excluir_recebimento(lote_id, quem, motivo)` e `recuperar_recebimento(excluido_id, motivo, quem)`; motivo opcional; erros em português por `RAISE EXCEPTION`). **Falta no app:** o `GRANT EXECUTE` dessas funções ao `labflow_app_web` numa migration do app e a tela da página Recebimento |
| PB5 | **Funções do banco para cadastrar pessoa e trocar cargo** (`cadastrar_usuario(nome, telefone, cargo, quem)`, `trocar_cargo(...)`), usadas pelo app (tela "Nova pessoa") e pelo bot (`adicionar cargo de ...`) | O app sai com a tela de adicionar pessoa já na primeira versão (decisão de 15/10) | **No ar em 21/10/2026** (migration `031_funcoes_usuarios`, funções `SECURITY DEFINER`; o bot usa o mesmo caminho no `adicionar cargo de ...`; testado no WhatsApp). Falta o `GRANT EXECUTE` para o `labflow_app_web`, que é a migration `051` do app |
| PB6 | **Assistente do app pelo mesmo workflow do bot:** aceitar no webhook `labflow-registro` mensagens com `canal: app` (mesmo formato da Evolution, telefone da pessoa logada, segredo no cabeçalho); quando o canal for `app`, os nodes de resposta (hoje `Zap · ...`, que chamam `sendText` da Evolution) e o download de mídia (`getBase64...`) passam a usar a **API do app** em vez da Evolution. O WhatsApp continua idêntico. Acrescentar casos em `tests/` | O assistente usa o mesmo cérebro do bot, sem duplicar regras ([08](08-fluxos.md), A4) | Pedido em 15/10/2026, autorizado pelo Danyllo; necessário só na Fase D |
| PB8 | **Registrar esterilização por frase** ("esterilizei meio de cultura e frascos, ciclo A1092/26") com as regras do app (APP-035): ciclo digitado pela pessoa, eficiente Sim por padrão, vários materiais do mesmo ciclo na mesma linha do laudo; grava em `app.esterilizacoes` por uma função do banco que o app cria | Os laudos se preenchem pelo que vier do app, do assistente ou do bot | Pedido em 23/10/2026; depois do APP-035 no ar |
| PB9 | **Análises novas por frase** (água do processo, baias e linhas): coleta e leitura (`<1`, número, "-" não coletado), gravando nas tabelas do app por funções do banco | Mesmo motivo do PB8 | Pedido em 23/10/2026; depois das análises no app |
| PB10 | **Data da incubação e (N)/(ST) nas análises do bot:** conferir se cada análise de recebimento, concentrado, embarque, tanques e NFC guarda o dia em que foi plaqueada e, nos tanques, se é direta (N) ou com teste de stress (ST, plaqueada 24 h depois). Responder aqui antes de qualquer mudança; se faltar, propor a migration na faixa do bot | O laudo de incubação e leitura monta uma linha por dia de incubação | **Respondido pela sessão do bot em 22/10/2026 (conferido no código e no banco de demonstração; nada mudou no ar).** **1) Data do plaqueamento.** Tanques de NFC: `analises.data_analise` (em `bi.leituras_nfc.data_analise`); **é a data que a pessoa digitou no comando de análise** (a mesma da coleta só quando o analista não diz outra: em 84 das 266 análises do piloto ela difere de `data_coleta`). Recebimento (FCOJ) e recebimento NFC: **não há coluna de plaqueamento**; o bot supõe que foi no dia do recebimento (`recebimento_lotes.data_recebimento`, `recebimento_nfc.data_recebimento`; os prazos C.T +2, B.L 72h +3 e B.L 120h +5 contam dela, em `bi.contagens.prevista`). Embarque: idem, `embarque_amostras.data_embarque`. TAB e Coliformes: a data do caldo é `testes.data_feito` e o **plaqueamento (espalhar)** tem o **previsto** em `espalhar_prevista` (já em `bi.testes`) e o **feito** em `testes.espalhado_em` (timestamp; preenchido em 52 dos 74 testes), que **ainda não aparece em nenhuma view `bi.*`**. **2) (N)/(ST) nos tanques.** Sim: `analises.frasco` = `Normal` (N) ou `Stress` (ST), em `bi.leituras_nfc.frasco`. **O bot não impõe 24 h de diferença**: o Stress leva a data que o analista digitar, e no modo `completo` do TAB de tanque as duas análises recebem a data da coleta (só 1 das 19 coletas com os dois frascos tem datas diferentes). **3) `data_analise` e `prevista`.** Sim: `data_analise` é o dia em que a análise começou (plaqueamento) e `prevista` = `data_analise` + prazo da etapa (pré-leitura: B.L +3, WORT +5; leitura final: C.T +2, B.L +5, WORT +10), gravada no momento do registro (não recalcula). **4) Recebimento/embarque (OSA, PDA).** O dia vale o do item 1. **O meio (OSA ou PDA) o bot não guarda**: o app já tem os lotes de meio (migration 060), então o meio por análise deve ser uma regra do app (tabela análise → meio) ou ser perguntada ao laboratório. **O que falta e a proposta (migration `038`, faixa do bot, só aditiva):** (a) incluir `espalhado_em` (e `espalhado_por`) em `bi.testes` (CREATE OR REPLACE VIEW com a coluna no fim); (b) criar a view **`bi.incubacao`** com uma linha por plaqueamento (`dia_incubacao`, `tipo` = tanque N / tanque ST / recebimento / embarque / NFC / TAB / Coliformes, o alvo, item, fábrica, análise, `leitura_prevista`), montada só com as colunas acima; (c) **só se o laboratório plaquear em dia diferente do recebimento/embarque**: coluna `data_plaqueamento` em `recebimento_lotes`, `recebimento_nfc` e `embarque_amostras` (padrão = a data atual) e o comando "plaqueado em dd/mm" no workflow (muda o `LabFlow.json`). **Decisões que preciso do Danyllo:** o ST é sempre 24 h depois do N (então o `completo` e o comando de análise passam a gravar o Stress com +1 dia)? C.T/B.L são plaqueados no dia do recebimento/embarque? Não mexi em nada; aguardo o OK para a 038. **Decidido pelo Danyllo (24/10): sem coluna nova de plaqueamento** (recebimento e embarque plaqueiam no dia em que chegam; o recebimento NFC tem a data do comando, que já é a da análise; nos tanques vale a `data_analise`). **Feito pela sessão do bot em 24/10: migration `038`** (só aditiva): `bi.testes` ganha `espalhado_em` e `espalhado_por` no fim, e a view **`bi.incubacao`** traz uma linha por plaqueamento (`tipo` Tanque/Recebimento/Embarque/Recebimento NFC/TAB/Coliformes, `dia_incubacao`, `frasco` N/ST ou fresh/past, `origem`, `alvo`, `load`, `item`, `fabrica`, `analise`, `pre_leitura_prevista`, `leitura_prevista`, `espalhar_prevista`, `espalhado_em`, `situacao`, `tabela`, `registro_id`); o `labflow_app_web` e o `labflow_leitura` leem pelos privilégios padrão do `bi`. **No ar em 24/10/2026** (038 aplicada; o app já pode ler `bi.incubacao`). **ST (decidido pelo Danyllo em 24/10): nem sempre 24 h depois do Normal, varia;** cada frasco fica com a data que o analista disser (`analises.data_analise`) e o laudo usa essa data, sem somar dia |
| PB7 | **Trocar o nome do cargo "Operador" por "Analista"** (decidido pelo Danyllo em 23/10): a trava `usuarios_cargo_check`, as funções `cadastrar_usuario` e `trocar_cargo` (031) e o que mais conferir o cargo (ex.: 033), os dados (`UPDATE usuarios SET cargo = 'Analista' WHERE cargo = 'Operador'`) e o workflow (`adicionar cargo Analista ...`, textos e conferências de permissão). Aceitar "Operador" como sinônimo por um tempo é opcional | O app já mostra "Analista" e a API aceita os dois, gravando "Operador" até o bot trocar; quando o PB7 for publicado, o app passa a gravar "Analista" (tirar o `NO_BANCO` de `rotas_admin.py` e acrescentar "Analista" em `permissoes.py`, no mesmo dia) | **Feito** pela sessão do bot em 23/10 (migration `035`, com "Operador" aceito como nome antigo; o mesmo PR tira o `NO_BANCO` antigo e põe "Analista" em `permissoes.py`). No ar quando o Danyllo aplicar a 035 e publicar o bot e a API |
| PB11 | **Funções do banco para o recebimento de FCOJ** (Fase E): `registrar_recebimento(quem, load, item, fabrica, lotes, data)` (as mesmas regras e a mesma confirmação "o que vai ser criado" do bot) e `lancar_contagem(quem, lote_ou_amostra, analise, valor)` (C.T 48h, B.L 72h e 120h; `=`, `<`, `>`; alarme), para o bot e o app chamarem a mesma coisa | O app registra e lança como o bot (Fase E, passo E2) | Pedido em 24/10/2026 |
| PB12 | **Funções do embarque** (registrar navio/linha/fase/amostras e compostas do embarque; resultados como no PB11) | Fase E, embarque no app | Pedido em 24/10/2026 |
| PB13 | **Funções de compostas, TAB, Coliformes e Howard** (criar composta, caldo, espalhar, ler, confirmar lote a lote, "todos de uma vez"; Howard em 50 campos) | Fase E, testes no app | Pedido em 24/10/2026 |
| PB14 | **Funções de tanques** (coleta de terra e navio com `coletado por`, análise N/ST, pré-leitura e leitura final com as placas, bag/pote) | Fase E, tanques e navios no app | Pedido em 24/10/2026 |
| PB15 | **Funções de drops** (concluir D5/D10/D15, abrir e lançar o desvio de drop) | Fase E, drops no app | Pedido em 24/10/2026 |
| PB16 | **Funções do recebimento de NFC** (registrar fresh/past e diluição, lançar C.T/B.L multiplicados) | Fase E, NFC no app | Pedido em 24/10/2026 |
| PB17 | **Funções de desvio de tanque e repetição e de "leitura do dia finalizada"** | Fase E, desvios no app | Pedido em 24/10/2026 |
| PB18 | **Modelo do relatório diário completo do bot** (o texto/estrutura que o bot manda no fim do dia, com as seções e a ordem) | A página nova **Relatório do dia** do app (25/10, APP-066) hoje mostra as pendências do dia por análise e o Finalizar; o Danyllo quer a mesma estrutura do relatório do bot | Respondido em 25/10/2026 (#286): modelo em `docs/comandos.md`, seção 15, "Modelo do relatório completo" (blocos FCOJ Recebimento, FCOJ Embarque, NFC Tank farm, NFC Navio; no NFC: Amostra Normal, Amostra Stress, Drops, TAB do tank farm; alertas no fim de cada bloco; "✅ lido: X de Y" e "Leitura do dia finalizada" no fim) |
| PB19 | **Embarque de FCOJ com vários loads e vários itens** na mesma linha e fase: `registrar_embarque` aceitar `43783/43784` (o primeiro é o principal da linha+fase) e mais de um item | Pedido do Danyllo de 25/10: a linha+fase é a "receita" embarcada, que pode juntar loads e itens | Feito em 25/10/2026, migration **102** (#286, no ar desde 25/10): `registrar_embarque` (mesma assinatura) aceita `p_load` "43783/43784" e `p_item` "2503/1233" (um item por load, na ordem; um só vale para todos); as amostras ficam no **principal** (o primeiro); tabela nova `embarque_loads(embarque_id, load_id, principal)` com SELECT para o `labflow_app_web`; retorno ganha `outros_loads` e `loads_novos` |
| PB20 | **Regra das compostas do embarque de FCOJ:** o **Coliformes** nasce sempre, na hora, de cada composta do embarque (`criar_compostas_embarque`); **TAB e Howard** só quando o analista pedir a partir da composta (função nova, ex.: `criar_teste_da_composta(quem, composta_id, 'TAB'|'HOWARD')`) | Decisão do Danyllo de 25/10; o app põe os botões "Criar TAB" e "Criar Howard" na composta quando a função existir | Feito em 25/10/2026, migration **101** (#286, no ar desde 25/10): **corrigido na 103 (decisão do Danyllo): a composta nasce SEM teste e o Coliformes fica pendente até o "coliformes feitos" ou o botão; o pendente sai da view `vw_coliformes_pendentes` (composta_id, origem, rotulo, load, item, lotes, criada_em)**; função nova `criar_teste_da_composta(quem, composta_id, 'TAB'|'COLIFORMES'|'HOWARD', percentual DEFAULT NULL, previa DEFAULT false)`: TAB no caldo hoje; Howard pede o percentual (par de 0 a 100); GRANT ao `labflow_app_web` |
| PB21 | **Arquivo de contra-amostras** (spec [`11-arquivo-contra-amostras.md`](11-arquivo-contra-amostras.md)): caixas cadastradas e vazias (tanque terra: caixa = número do tanque; navio: uma por navio e viagem, na faixa da família, um pote por tanque de NFC; recebimento de FCOJ: caixas 121 a 145, lidas na foto ou digitadas), o arquivamento automático a partir da coleta, do embarque e do recebimento (com a caixa informada pelo analista, também pela foto), as datas de descarte (NFC 1 ano, FCOJ do navio 2 anos e a caixa inteira 2 anos, recebimento 7 dias), a consulta e o registro do descarte (um sim), e funções/views com GRANT ao app para os laudos por caixa e a página Arquivo; descarte por Admin e Analista; carga inicial do que já está na planilha | Pedido do Danyllo de 25/10 (planilha e modelos dos laudos com ele, fora do Git): o registro que o analista já faz deve arquivar a amostra, montar o laudo da caixa e mostrar o que pode ser descartado; comandos novos no bot e no app | **Feito pela sessão do bot em 25/10/2026, migration 105** (respostas do Danyllo: recebimento 121-145 começando pela 121, tanques 34-49, o vencido da planilha entra como descartado, sem aviso para ninguém: a página mostra em vermelho o que venceu). **Para o app:** `vw_arquivo_caixas` (tipo, numero, familia, navio, viagem, itens_arquivados, amostras, descarte_em, situacao Disponível/Em uso/**Vencida**, itens_vencidos) e `vw_arquivo_itens` (caixa_tipo, caixa, item bag/pote/fcoj/carga/recebimento, descricao, navio, viagem, tanque, load, lotes, quantidade, data_ref, data_descarte, situacao Arquivado/**Vencido**/Descartado, descartado_em); funções `arquivo_arquivar_recebimento(quem, load, item, lotes int[], caixa, data, previa)`, `arquivo_descartar(quem, tipo, numero, previa)` (tipo navio, recebimento ou tanque; devolvem `{ok, previa, texto}`, erro por `RAISE EXCEPTION`) e `arquivo_caixa_recebimento_sugerida()`, com GRANT ao `labflow_app_web`; SELECT nas tabelas `arquivo_familias`, `arquivo_caixas`, `arquivo_navios` e `arquivo_recebimento`. Comandos do bot em `docs/comandos.md`, seção 20. Falta: a caixa do recebimento **pela foto** (próximo PR do bot). **App (25/10):** página **Arquivo** (menu e Análises → Rotina) com as caixas, o conteúdo, arquivar o recebimento e descartar (GRANT repetido na 074 do app); os laudos por caixa esperam o modelo em PDF |
| PB22 | **Lista única das pendências do dia** (além das leituras): TAB e Coliformes no caldo, para ler e em confirmação, composta esperando análise, Stress de tanque, o atrasado de outro turno primeiro | Pedido do Danyllo de 25/10 para o "Análises a fazer hoje" do app e o bot lerem a mesma regra | **Feito pela sessão do bot em 25/10/2026, migration 106:** view `vw_pendencias_do_dia` (grupo TAB/Coliformes/Compostas/Tanques, etapa, alvo, prevista, **atrasado**, tabela, ref_id; só o que vence hoje ou já venceu) com SELECT ao `labflow_app_web`; o bot responde `pendências do dia`. **Para o app:** mostrar no "Análises a fazer hoje" junto das leituras, o atrasado em vermelho. Também na 106: `navio_apelidos` e `navio_nome_oficial(texto)` (o app pode usar para mostrar e gravar o nome oficial) |

**Recados da sessão do bot para o app (25/10/2026, depois da varredura do bot):**
- **Coliformes obrigatório (regra do Danyllo, 25/10; migration 104 do bot):** no **embarque**, toda composta; no **recebimento**, só **uma composta de cada load, a primeira** (ex.: lotes 1-5 de um load novo); feito o Coliformes de uma composta do load, as outras não pedem; na fábrica **COL (Colina)**, toda composta do load. **O que já estava no banco não é obrigatório.** A `vw_coliformes_pendentes` ganha no fim `obrigatorio` (boolean) e `motivo` (`embarque: toda composta`, `fábrica COL: toda composta do load`, `primeira composta do load`): o app mostra como pendência (sininho, Início, Relatório do dia) **só as com `obrigatorio = true`**; as outras ficam como opcionais na composta. `criar_compostas` devolve também `coliformes_obrigatorio` (ids) e o aviso no `texto`.
- **Botões "Criar TAB" e "Criar Howard"** (e "Fazer Coliformes") na composta: `criar_teste_da_composta` já está no ar (103) e ainda não é chamada pelo app.
- **Embarque com vários loads e itens** na tela (`embarque_loads`, 102) e o **Relatório do dia** no modelo do bot (`docs/comandos.md`, seção 15).
- **Recuperar lote apagado do recebimento:** `recuperar_recebimento` (036) existe; o app só recupera coletas.
- **Laudos novos** (tabela "Laudos automáticos" acima): Recebimento NFC (mesmo modelo do FCOJ, item 129), NFC de tanques e navios, Embarque, TAB, Coliformes e Howard. O Admin envia cada PDF pela aba Laudo (os PDFs não vão para o Git).
- **A caminho, do lado do bot:** uma função só do relatório do dia para o bot e o app (hoje o relatório do bot não conta água do processo, baias, linhas e esterilização) e a correção de resultado com motivo (039) numa função que o app também possa chamar.


**Funções do app para o PB8 e o PB9 (24/10/2026, APP-054, migration 067):** o bot grava pelas funções abaixo (schema `app`, `SECURITY DEFINER`, `EXECUTE` para o `labflow_app`), com as mesmas regras e as mesmas páginas de laudo do app. Quem pode é conferido nelas (esterilização e resultados: Admin e Analista; coletas: Admin, Analista e Coletor); o turno e o dia saem da entrada aberta da pessoa no app ou do horário (a Madrugada conta no dia em que começou). Erro = `RAISE EXCEPTION` com a frase pronta para o WhatsApp.
- `app.bot_registrar_esterilizacao(quem, tipos text[], ciclo, meio, descricao, quando)` → uma linha por material (`Ponteira`, `Meio`, `Frasco`, `Água de diluição`, `Descarte`, `Outro`), todas na mesma linha do laudo; eficiente Sim; ciclo como a pessoa digitou. Ex.: `SELECT * FROM app.bot_registrar_esterilizacao(12, ARRAY['Meio','Frasco'], 'A1092/26')`.
- `app.bot_coletar_agua(quem, pontos text[], quando, observacao)` → pontos `manifold`, `camara4`, `camara5`, `camara6`.
- `app.bot_lancar_agua(quem, ct jsonb, bl jsonb, coleta_id)` → `{"todos":"<1"}` ou por ponto (`{"manifold":"<1","camara5":"2"}`); sem `coleta_id`, a coleta mais recente que espera resultado.
- `app.bot_coletar_superficie(quem, 'Baia'|'Linha', pontos text[], quando, analisada_em, observacao)` → uma linha por ponto (baia 8 vira "08"); `analisada_em` até 3 dias depois da coleta.
- `app.bot_lancar_superficie(quem, 'Baia'|'Linha', ponto, campos jsonb, coleta_id)` → `{"ct_48":"<1"}`, `{"bl_72":..}`, `{"bl_120":..}`; sem `coleta_id`, a coleta mais recente do ponto ainda sem aquela leitura.
- Resultado aceito: `<1`, `>300`, número (vírgula ou ponto) ou `-`; espaços somem; vazio apaga a leitura.

**Alinhamento com a sessão do bot (17/10/2026):**
- Ordem de publicação combinada: **PB5 → PB1 → PB4 → PB6** (quem decide quando é o Danyllo; PB5 e PB1 foram publicados em 21/10/2026; PB4 e PB6 ainda não começaram).
- **PB4 fica com a sessão do bot**, migration **033**; o app só chama as funções.
- As funções chamadas pelo app (PB5 e PB4) são **`SECURITY DEFINER`**, com dono `labflow_app`, `SET search_path = public, pg_temp` e conferência da permissão pelo `p_quem` dentro da função (o `labflow_app_web` não grava nas tabelas do bot).
- O `GRANT EXECUTE` dessas funções para o `labflow_app_web` fica na migration **051 do app**, depois que a 050 for aplicada no servidor.
- As leituras gravadas adiantadas pelo Admin têm origem `automatico` no banco (ver 07, "Registros adiantados pelo Admin").

## Regras que não mudam

- Quem mexe em quê entre a sessão do app e a do bot, e como escolher o número da migration: `CLAUDE.md`, "Sessão do app × sessão do bot".
- O app **lê** as tabelas do bot **por views** e **grava nelas só por funções do banco aprovadas** (ex.: `excluir_coleta(id, quem, motivo)`), as mesmas que o bot passa a usar: a regra mora num lugar só (decisão de 15/10). Tabelas novas são só dele. Migrations do app **a partir da 050** (mudado em 15/10: 021–026 são do LIMS; 027, 028, 029 e de 030 a 049 ficam com a sessão do bot, que já começou pela 030).
- Não mexer em `LabFlow.json`, `LabFlow_Alerta_Erro.json`, migrations existentes nem `docs/comandos.md`: isso é da sessão do bot.
- Permissão validada no código (Operador/Admin), nunca no prompt da IA.
- Dados sempre fictícios; nunca IP, chave, telefone ou ID real no repositório.

## Sinais de que se perdeu

- Está escrevendo código antes da spec aprovada.
- Criou um documento novo em vez de evoluir o `07-app-pwa.md` e os vizinhos.
- Está mudando algo do bot do WhatsApp.
- Decidiu sozinho uma das "decisões em aberto".

## Pedidos do Danyllo para o app (25/10/2026, noite, passados pela sessão do bot)

1. **"Análises a fazer hoje" (Início/Turno) mostra só as leituras do dia.** Tem que mostrar também as **análises pendentes**, como
   etapas a fazer, cada uma com o que está **atrasado (herdado de outro turno)** em destaque:
   - **TAB no caldo para espalhar e incubar** (previsto em `bi.testes.espalhar_prevista`, ainda sem `espalhado_em`);
   - **Coliformes no caldo para estriar** (tirar do caldo) e **Coliformes para ler**;
   - **confirmatório**: TAB em confirmação (PCA) e Coliformes aberto lote a lote esperando resultado;
   - **composta esperando a análise**: Coliformes obrigatório (`vw_coliformes_pendentes` com `obrigatorio = true`, migration 104)
     e composta sem TAB quando o TAB é pedido;
   - **Stress de tanque** ainda por fazer (coleta com o frasco Normal analisado e o Stress pendente);
   - o que passou do dia previsto (atrasado) aparece primeiro, em vermelho, como o bot faz (`⚠️ Atrasados — previsto dd/mm`).
   As mesmas consultas o bot já responde (`quais tabs tenho para espalhar hoje?`, `quais coliformes tenho para estriar hoje?`,
   `... para ler hoje?`); a sessão do bot pode entregar uma view única de pendências do dia, se o app pedir (seria o PB22).
2. **Esterilização: ícone e cor em cada material** (os botões hoje são só texto): **Ponteira** = ícone de ponteira;
   **Meio** = frasco com líquido dentro; **Frasco** = frasco grande vazio; **Água de diluição** = uma ou várias garrafinhas;
   **Descarte** = saco de lixo com placas dentro; **Outro** = um ícone neutro (ex.: reticências ou caixa). Cada um com a sua cor,
   para reconhecer de relance (no botão e na lista/laudo da tela).

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
- 21/10/2026: **app usado no celular ou no tablet com barreiras de segurança**: localização da fábrica, horário do turno e aparelho autorizado (detalhe em "Segurança no celular", no topo).
- 21/10/2026: ideias tiradas de um **sistema de monitoramento ambiental feito internamente** (tour em vídeo, visto em 21/10; nada dele vai para o repositório). O que vale trazer para o LabFlow:
  - **aviso de valor fora do histórico** antes de gravar (ex.: C.T muito acima do normal do tanque): "confira a digitação ou a diluição";
  - **senha como assinatura** ao gravar resultado e **código de integridade** (hash) em cada resultado, para detectar alteração (combina com a [auditoria](02-audit-trail.md) e a ISO 17025);
  - **laudo do período com assinatura eletrônica**, bloqueado depois de assinado e conferível por um código de validação;
  - **ações corretivas** com área, responsável, prazo, andamento, causa raiz, **eficácia** e reteste ligado à ação, com prazo vencido em vermelho;
  - **gráfico de controle** por ponto ou tanque (cada resultado, linha de alerta e de ação) e **alertas preditivos** (piora gradual antes de passar do limite; pontos recorrentes);
  - **efeito de turno, equipe, produto e safra** destacado quando uma categoria tem o dobro da média;
  - **limites calculados pelo histórico** (alerta = percentil 95, ação = percentil 98, com mínimo de resultados), aplicados só com confirmação;
  - **agenda gerada sozinha** pela frequência, com rodízio entre pontos do mesmo grupo, e **etiquetas com QR code** para as amostras;
  - **relatório semanal e mensal** montado sozinho e enviado por e-mail para as áreas;
  - **visão de gestor com várias unidades** e comparativo entre elas;
  - **importar o histórico das planilhas de Excel**;
  - **faixa "Dados de demonstração"** no topo enquanto o servidor tiver dados fictícios;
  - **eventos e mudanças** (obra, equipamento novo, troca de sanitizante) marcados nos gráficos de tendência.
- 21/10/2026: **monitoramento ambiental como módulo do LabFlow**, no mesmo servidor e no mesmo banco PostgreSQL: o sistema interno já é web por dentro, então dá para levar as telas e as regras para um banco central (várias pessoas gravando ao mesmo tempo sem risco, celular e tablet, backup fora da pasta) e mostrar as coletas atrasadas do ambiental no "Início" do analista. Lição para o LabFlow: **banco em arquivo dentro de pasta de rede não aguenta várias pessoas gravando** e quem acessa a pasta leva tudo; por isso o LabFlow fica em servidor com banco de verdade.
