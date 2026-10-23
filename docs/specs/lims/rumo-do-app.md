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

**Andamento (22/10/2026):** Marco 1 completo e no ar (APP-012 a APP-016, #147 a #153; migration 051 aplicada em 21/10). Marco 2: APP-017, APP-018 e APP-019 mescladas (#158, #159, #160: todas as páginas do Power BI no app); APP-020 (gráfico G2) mesclada (#162): **Marco 2 completo e no ar** (atualizado no servidor em 23/10, ~00:30, sem migration). APP-019b (Tanques terra e Navios com status e a página de cada um) mesclada (#167) e no ar em 23/10, sem migration. Marco 3 começou: APP-021 (migration 052) mesclada (#165); APP-022 (entrar e sair do turno, cartão Feito no turno) em PR; a 052 vai para o servidor junto com ela.

**Acabamento visual (combinado em 22/10):** o Danyllo achou as cores "cruas". Fica para uma etapa própria, **depois de os marcos funcionarem**: revisar de uma vez cores, contraste, espaçamento e tamanhos em todas as telas (celular e computador), mantendo a paleta aprovada em 15/10 (07 §Visual) e sem emoji.

**Fica fora da Fase C:** relatório do dia igual ao do bot (depende do PB6, Fase D); assistente (Fase D); editar e excluir (dependem do PB4); barreiras de segurança no celular (versão depois do piloto do app).

## Decisões em aberto (perguntar, não decidir sozinho)

- **Quando ligar as barreiras de segurança no celular** (localização, horário, aparelho autorizado) e quem da gestão aprova o uso da localização (LGPD).

## Pedidos para a sessão do bot

O app não mexe nas tabelas nem no workflow do bot: o que ele precisa vira pedido aqui, e a sessão do bot decide como e quando fazer.

| # | Pedido | Por quê | Situação |
|---|---|---|---|
| PB1 | **Toda leitura, análise e registro com a hora** em que foi feito. Hoje falta em `analises`: a pré-leitura e a leitura final guardam só quem (`pre_leitura_por`, `leitura_final_por`), sem a hora. Sugestão: colunas `pre_leitura_em` e `leitura_final_em` numa migration do bot (028/029), preenchidas pelo workflow | O relatório do turno precisa saber em qual turno cada coisa foi feita (rastreio) | **No ar em 21/10/2026** (migration `030_hora_leituras`: colunas `pre_leitura_em` e `leitura_final_em` preenchidas por gatilho no banco e `lida_em` em `bi.leituras_nfc`; leituras antigas ficam sem hora). Pedido de 15/10, autorizado pelo Danyllo |
| PB2 | Cargo **Coletor** (só registra coletas) na tabela `usuarios` e nas permissões do bot | Novo perfil previsto; o bot e o app precisam do mesmo cargo | **Atendido** pela sessão do bot (migration `029_cargo_coletor`, 15/10/2026): Coletor registra coleta e corrige/apaga a própria coleta |
| PB4 | **Funções do banco para editar e excluir** (ex.: `excluir_coleta(id, quem, motivo)`, `corrigir_recebimento(...)`), usadas pelo app e pelo bot; começar por **Coletas** e **Recebimento**. Excluir **guarda** o registro como excluído (não apaga de vez) | Decisão de 15/10 (opção A): a regra mora num lugar só | Pedido em 15/10/2026; desenho detalhado no [08](08-fluxos.md) |
| PB5 | **Funções do banco para cadastrar pessoa e trocar cargo** (`cadastrar_usuario(nome, telefone, cargo, quem)`, `trocar_cargo(...)`), usadas pelo app (tela "Nova pessoa") e pelo bot (`adicionar cargo de ...`) | O app sai com a tela de adicionar pessoa já na primeira versão (decisão de 15/10) | **No ar em 21/10/2026** (migration `031_funcoes_usuarios`, funções `SECURITY DEFINER`; o bot usa o mesmo caminho no `adicionar cargo de ...`; testado no WhatsApp). Falta o `GRANT EXECUTE` para o `labflow_app_web`, que é a migration `051` do app |
| PB6 | **Assistente do app pelo mesmo workflow do bot:** aceitar no webhook `labflow-registro` mensagens com `canal: app` (mesmo formato da Evolution, telefone da pessoa logada, segredo no cabeçalho); quando o canal for `app`, os nodes de resposta (hoje `Zap · ...`, que chamam `sendText` da Evolution) e o download de mídia (`getBase64...`) passam a usar a **API do app** em vez da Evolution. O WhatsApp continua idêntico. Acrescentar casos em `tests/` | O assistente usa o mesmo cérebro do bot, sem duplicar regras ([08](08-fluxos.md), A4) | Pedido em 15/10/2026, autorizado pelo Danyllo; necessário só na Fase D |
| PB7 | **Trocar o nome do cargo "Operador" por "Analista"** (decidido pelo Danyllo em 23/10): a trava `usuarios_cargo_check`, as funções `cadastrar_usuario` e `trocar_cargo` (031) e o que mais conferir o cargo (ex.: 033), os dados (`UPDATE usuarios SET cargo = 'Analista' WHERE cargo = 'Operador'`) e o workflow (`adicionar cargo Analista ...`, textos e conferências de permissão). Aceitar "Operador" como sinônimo por um tempo é opcional | O app já mostra "Analista" e a API aceita os dois, gravando "Operador" até o bot trocar; quando o PB7 for publicado, o app passa a gravar "Analista" (tirar o `NO_BANCO` de `rotas_admin.py` e acrescentar "Analista" em `permissoes.py`, no mesmo dia) | Pedido em 23/10 |


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
