# Changelog

Todas as mudanças relevantes deste projeto (LabFlow — automação de registro
de amostras via WhatsApp) são documentadas aqui. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Pra detalhes de *como* cada bug foi encontrado e resolvido, ver
`docs/troubleshooting.md`. Pra entender a arquitetura atual do sistema, ver
`docs/arquitetura.md`. Pra detalhes da infraestrutura de deploy, ver
`docs/deploy-vps.md`. Este arquivo é só o resumo cronológico do que mudou.


## [1.1.0] - 2026-10-04

### Added
- **Módulo de suco concentrado (FCOJ)**, tudo pelo WhatsApp e sobre o PostgreSQL. Desenho em
  `docs/concentrado.md`, comandos em `docs/comandos.md` (seções 12.1 a 15):
  - **Recebimento** de lotes por load, item e fábrica, e **compostas** (de 1 a N lotes, em
    qualquer combinação) com número curto `#N`
  - **TAB de composta**: caldo → espalhar (+5 dias) → incubar → confirmação (PCA 24h) → resultado,
    com consultas ("quais tabs tenho para espalhar/ler hoje?"), comandos em lote e atrasados com a
    data prevista
  - **TAB de NFC (tank farm)**, por tanque, sempre citando a data da coleta
  - **Coliformes de composta**: caldo → estria (+1 dia) → leitura (+1 dia); a confirmação abre a
    composta lote a lote (no embarque, amostra a amostra)
  - **Embarque** por navio + viagem, linha e fase, com amostras A1, A2... de um load por comando;
    load antigo que nunca passou pelo recebimento é cadastrado na hora (a fábrica é opcional)
  - **Howard** (embarque): porcentagem em 50 campos, sempre par, com confirmação
  - **C.T 48h e B.L 72h/120h por lote e por amostra**, com vários grupos por mensagem
    (`ct load 77001 lote 4 deu 10, lotes 5-10 deu <10`) e valores `=`, `<` e `>`
  - **Alarme**: B.L a partir de 50 e C.T a partir de 200; TAB e Coliformes positivos também
- **Relatório do dia com os quatro blocos** (FCOJ recebimento, FCOJ embarque, NFC tank farm e NFC
  navio) numa mensagem só, com ✅ no lido e 🚨 no que passou do limite. `relatório do dia completo`
  traz só o que já foi lido, com a Situação (`ok` / `não ok`) nas linhas do concentrado. Filtros por
  bloco (`recebimento`, `embarque`, `tanques terra`...)
- Migrations `003` a `010` (`db/migrations/`): relatório de NFC, view das compostas, confirmação do
  TAB, testes por lote e por amostra, busca de composta, embarque, contagens e testes de embarque
- `scripts/sanitize-workflow.ps1`: gera o `LabFlow.json` público a partir do export com IDs reais
- Comandos de embarque, Howard, TAB de NFC e C.T/B.L documentados em `docs/comandos.md`; desenho
  completo do módulo em `docs/concentrado.md`

### Changed
- O workflow passou de 97 para 159 nodes (41 nodes Postgres, todos parametrizados), dentro do mesmo
  bloco "Concentrado" do canvas
- `relatório do dia` deixou de ser só NFC: sozinho, traz os quatro blocos. A linha TAB do tank farm,
  que mostrava `-`, passa a listar os TABs de NFC
- TAB e Coliformes aparecem no **masculino** nos textos de status ("O TAB do tanque 92 está
  Incubado", "Os Coliformes estão Estriados"); no banco os valores continuam como antes
- As telas do TAB e dos Coliformes passaram a mostrar compostas de embarque
  (`O.SKY 133 linha 2 fase 2 (A1-A5)`) e tanques de NFC, além das compostas de load
- `vw_compostas` reúne as compostas de recebimento e de embarque; `loads.fabrica_id` deixou de ser
  obrigatório
- Os arquivos `LabFlow_importar_n8n*.json` (com IDs reais) ficam todos fora do Git

### Security
- Regras também no banco: composta de load **ou** de embarque, teste de exatamente um alvo
  (composta, tanque, lote ou amostra), Howard sempre par (`percentual = campos_positivos × 2`),
  resultado repetido de C.T/B.L corrige o anterior em vez de duplicar
- Gravações novas pedem "sim" (Howard, C.T/B.L, TAB e Coliformes); Consultor só consulta
- `scripts/sanitize-workflow.ps1` confere que nenhum ID real de credencial nem `instanceId` sobra no
  arquivo público

### Notes
- Tudo foi testado pelo WhatsApp em 04/10/2026, com dados fictícios
- O fallback de IA (Gemini) ainda **não conhece** os comandos do concentrado: mensagem livre sobre
  eles cai em "comando inválido". Os comandos precisam ser escritos no formato padrão
- Limites e Situação do Howard e do NFC, `leitura de hoje finalizada`, e-mail e Excel ficam para
  as próximas versões


## [1.0.0] - 2026-10-01

### Changed
- **Breaking (dados):** os dados saíram do Google Sheets e foram para o
  PostgreSQL (banco `labflow` no container `labflow-postgres` da stack). O
  workflow não tem mais nenhum node do Google Sheets: são 22 nodes Postgres,
  todos com parâmetros (`$1`, `$2`...), nunca com texto concatenado
- Os comandos e as respostas do bot continuam os mesmos. A coleta grava
  coleta + drops D5/D10/D15 + bag ou pote numa instrução só, e a conclusão
  de leitura grava o usuário que leu
- **Análise de tanque exige coleta:** o registro liga cada tanque à coleta
  mais recente até a data da análise. Se algum tanque não tiver coleta,
  nada é gravado e o bot responde "Análise não registrada: não há coleta
  ... Registre a coleta primeiro"
- Navio separado em nome e viagem (`O.SKY 123` = nome `O.SKY`, viagem `123`)
- Quem registrou, concluiu ou leu passa a ser guardado como usuário (chave
  estrangeira), e não como texto livre
- "Hoje" é `CURRENT_DATE` do banco (fuso `America/Sao_Paulo`), e a expiração
  de 10 minutos da confirmação é calculada pelo banco
- Workflow reorganizado em 8 blocos coloridos, com nomes padronizados:
  `BD ·` (banco), `Zap ·` (envia no WhatsApp), `Fim ·` (responde ao
  webhook) e `Montar resposta ...` (formata o texto)
- Texto do bot e prompt do Gemini: D5, D10 e D15 são "análises de drop",
  não "reanálises"

### Added
- `db/migrations/001_tanques.sql` (usuarios, navios, coletas, drops,
  arquivo_amostras, analises, confirmacoes) e `db/migrations/002_concentrado.sql`
  (recebimento, embarque, compostas, TAB, Coliformes e Howard; rascunho,
  ainda não aplicada)
- Usuário somente leitura `labflow_leitura`, para o DBeaver e para o Power BI
- Backup diário do banco (`scripts/backup-db.sh`: `pg_dump`, `cron` às 3h,
  14 dias de retenção), documentado em `docs/scripts.md`
- `docs/postgres-migracao.md` (plano e decisões) e `docs/handoff.md`
  (retomar o projeto em outro computador)
- `.gitignore`

### Fixed
- Dois `If` da IA comparavam texto fixo e davam sempre verdadeiro — ver Bug 25
- Duplicar o workflow trocou o caminho do webhook — ver Bug 26
- Referência a node com maiúscula diferente: a coleta gravava e a resposta
  falhava — ver Bug 27
- Telefone cadastrado com zero na frente aparecia como não cadastrado —
  ver Bug 28

### Security
- O banco confere as regras de novo, como segunda barreira: cargo válido
  (`CHECK`), coleta duplicada (`UNIQUE`), vínculo entre coleta, drop, arquivo
  e análise (chave estrangeira) e CT sem pré-leitura
- Consultas sempre parametrizadas, sem montar SQL com texto da mensagem
- Usuário da aplicação e usuário somente leitura separados, e o banco do
  LabFlow isolado do banco da Evolution API
- Senhas só no `.env` do servidor e em Credenciais do n8n; backups com
  permissão restrita (pasta `700`, arquivos `600`)

### Notes
- O servidor é de demonstração, com dados fictícios. O workflow antigo, do
  Google Sheets, continua no n8n **desativado**, como plano B: para voltar
  atrás, desative o novo e ative o antigo (os dois usam o caminho
  `labflow-registro` e não podem ficar ativos juntos)


## [0.9.0] - 2026-09-29

### Added
- A IA passa a cobrir todos os comandos, não só a coleta. Novas intenções
  no Gemini e no `Validar IA`:
  - consultas (`consulta_drops`, `consulta_analises_terra`,
    `consulta_analises_navio`, `consulta_bags`, `consulta_potes`): rodam
    direto, sem pedir "sim", porque só leem a planilha
  - `registro_analise` (frasco normal ou stress, terra ou navio)
  - `concluir_drops` (dia D5/D10/D15, terra ou navio)
  - `concluir_leitura` (pré ou final, CT/BL/WORT, normal ou stress): vai
    direto para o fluxo de leitura, que já lista as leituras e pede o
    "sim". A IA não pede uma segunda confirmação
  - `gerenciar_cargo` (troca de cargo por frase livre)
- Ajuda por tópico, sem IA: `comandos`, `comandos para drops`, `consultar
  análises`, `consultar leituras`, `consultar descarte`, `consultar cargos`
  e `consultar tanques` mostram só os comandos do assunto. Trecho novo
  no Code node, antes do `Gerenciar usuário`
- Mais jeitos de perguntar bags e potes ("bags de terra hoje", "descartar
  potes hoje", "quais potes posso descartar hoje")
- Permissão checada duas vezes: o `Validar IA` recusa na hora o Consultor
  que tenta gravar e quem não é Admin tentando trocar cargo (sem gastar
  um "sim"), e a regex do Code node continua sendo a barreira final. Para
  isso o Code node passa `nivelAtual` ao `Validar IA`
- Exemplos no prompt do Gemini (10 mensagens com a resposta esperada) e
  data de hoje preenchida automaticamente nos exemplos

### Changed
- Resposta de coleta: `Registro de tanque terra/navio efetuado com
  sucesso por <nome de quem enviou>`, seguida de tanques, data e total
- Mensagem de "não entendi" da IA ficou curta: `Comando inválido. Se
  desejar consultar a lista de comandos, escreva o que procura. Por
  exemplo: consultar drops`, com a lista de assuntos. Antes listava todos
  os formatos e poluía o chat
- `Validar IA` devolve `reenviarComando` (consulta e leitura) ou
  `comando_ia` (gravação com confirmação), e o resultado passa pelos Ifs
  `If Reenviar Consulta` e `If Tem Resposta IA`
- Regra do prompt: mensagem de coleta só com números e sem navio é coleta
  de terra, mesmo sem a palavra "terra"

### Removed
- Nodes do ramo `amostra` (sem entrada desde a 0.8.0)

### Fixed
- Troca de cargo por frase livre promovia "gerente" a Admin: a IA trocava
  a palavra pelo cargo válido mais parecido — ver Bug 23
- Apagar a linha de cabeçalho de uma aba ao limpar dados de teste fazia o
  próximo `Append` falhar — ver Bug 22
- Gemini leve respondia `desconhecido` para "coletei os tanques 60 e 61
  hoje" depois que o prompt ganhou mais intenções — ver Bug 24

### Security
- O cargo e o telefone da troca de cargo precisam estar escritos na
  mensagem original: o código confere o texto do usuário e ignora o que
  a IA "corrigiu". Sem isso, um erro de interpretação viraria promoção
- Toda gravação vinda da IA continua pedindo "sim" e passando pelas regras
  da regex na execução (cargo, limites, duplicata)


## [0.8.0] - 2026-09-29

### Added
- IA como fallback da regex (Gemini): mensagem que nenhuma regex reconhece
  vai para o node `Message a model Interpretar IA`, que devolve um JSON
  (`intencao`, `tanques`, `navio`, `data`). Hoje entende coleta de terra e
  de navio, inclusive frases livres ("coletei os tanques 42 e 43 hoje") e
  nome de navio sem a palavra "navio"
- Node `Validar IA`: confere o JSON com as mesmas regras da regex (tanques
  válidos, limites de 8 e 16, data `dd/mm/aaaa`, navio obrigatório) e monta
  o comando no formato padrão
- Confirmação antes de executar: o bot mostra o comando entendido e pede
  "sim" ou "não". A pendência usa a aba `CONFIRMACOES_PENDENTES` (`IDs =
  IA`, `Resumo` = comando), com a mesma expiração de 10 minutos
- Reenvio do comando confirmado ao próprio webhook (`labflowReenvio:
  true`), para executar pela regex normal. Se ainda não for reconhecido,
  responde erro em vez de voltar à IA (sem loop)
- Aviso "A IA está indisponível" quando o Gemini falha; `Retry On Fail`
  com 5 tentativas e 3 s de espera
- Node `If Tem Resposta`: pula o envio de WhatsApp quando não há texto de
  resposta (caso da confirmação da IA), mas continua respondendo ao
  webhook
- Documentação: `docs/arquitetura.md` (seção da IA), `docs/comandos.md`
  (seção 11) e Bugs 20 e 21 em `docs/troubleshooting.md`

### Changed
- `Processar Confirmacao` reconhece pendência da IA (`IDs = IA`) e devolve
  `reenviarComando`
- `scripts/audit-workflow.py`: um HTTP Request que reenvia para o próprio
  webhook do workflow não exige `Respond to Webhook` depois, porque a
  resposta ao webhook original sai por outro ramo e a chamada abre uma
  execução própria
- Nodes `Update Row ANALISES` renomeados para `... Pre` e `... Final`
- Modelo do Gemini trocado para uma variante Flash-Lite depois de falhas
  de disponibilidade

### Removed
- **Breaking:** comando de registro de amostra avulsa (`amostra <número>
  ...`). As amostras do laboratório serão o recebimento e o embarque, em
  planilha própria. Uma mensagem sem comando reconhecido agora vai para a
  IA em vez de virar amostra. O ramo `amostra` ainda existe no canvas do
  n8n, sem entrada, e a aba `AMOSTRAS` está sem uso; ambos serão apagados

### Fixed
- Mensagem "fantasma" no WhatsApp depois de confirmar um comando da IA:
  texto vazio no `HTTP Request Confirmar Resposta` gerava erro 400 e a
  Evolution API reenviava o "sim" — ver Bug 20
- Falha do Gemini (503) aparecia como "Não entendi a mensagem" — ver Bug 21

### Security
- A IA não grava dados: só sugere um comando, que precisa de confirmação e
  passa pelas regras de sempre (cargo, limites, duplicata) na execução do
  comando reenviado
- O `LabFlow.json` continua sem segredos: a credencial do Gemini fica no
  n8n, e o arquivo público traz só o placeholder `GEMINI_CREDENTIAL_ID`


## [0.7.0] - 2026-09-25

### Added
- Conclusão de leituras de análise via WhatsApp (`Concluir [pre|final]
  leitura [CT|BL|WORT] [normal|stress] terra|navio [nome]`), com
  confirmação em duas etapas: o bot lista as leituras que vencem hoje e
  só altera a aba `ANALISES` depois de uma resposta "sim"; "não" cancela
  e a pendência expira em 10 minutos
- Colunas `Pre-Leitura Feita Por` e `Leitura Final Feita Por` na aba
  `ANALISES`, preenchidas com o nome de quem confirmou a leitura; a
  resposta de confirmação mostra "Leitura feita por: <nome>"
- Nova aba `CONFIRMACOES_PENDENTES` (`Numero, IDs, NovosStatus, Resumo,
  Criado Em`) para guardar a pendência entre as duas mensagens
- Script `scripts/audit-workflow.py`, que audita o `LabFlow.json`:
  conexões para nodes inexistentes, nodes órfãos, HTTP Request sem
  `Respond to Webhook`, placeholder `PRECISA_RESELECIONAR` e espaço antes
  de `{{`; com `--public`, também dados sensíveis (ID de planilha e de
  credencial, `instanceId`, `pinData`, telefone, e-mail, chave de API).
  Documentado em `docs/scripts.md`
- GitHub Action (`.github/workflows/audit-workflow.yml`) que roda a
  auditoria a cada alteração do `LabFlow.json`
- Consulta de análises do dia marca com ✅ as leituras já feitas e mostra
  o total no fim (ex: "✅ = lido (2 de 5)"); para o WORT, o tanque só
  ganha ✅ quando Profundidade e Superfície estão lidas
- Confirmação do registro de análise mostra a data da leitura final do
  CT (`Data final CT`)

### Fixed
- Pendências de confirmação nunca expiravam: `toLocaleString('pt-BR')`
  grava `"25/09/2026, 21:08:28"` (com vírgula depois do ano), e a leitura
  por `split(' ')` transformava o ano em `NaN`, fazendo `NaN > 10` ser
  sempre falso. Agora a data é lida por regex (com ou sem vírgula) e
  convertida para UTC; se não der para ler, a pendência é tratada como
  expirada
- Caminho de cargo negado sem `Respond to Webhook`
- Nodes criados depois do export apontavam para `PRECISA_RESELECIONAR`
  no campo Sheet, e a gravação na aba `CONFIRMACOES_PENDENTES` falhava —
  ver Bug 16
- Espaço no começo de algumas respostas do WhatsApp, vindo de espaços
  entre `=` e `{{` no campo `text` dos HTTP Request — ver Bug 17
- Comando de análise com "tanque terra 40" gravava o tanque como
  `TERRA 40`; a palavra "terra" agora é opcional na regex e fica fora da
  captura
- Consulta de análises repetia o tanque no WORT ("Tanques 99 e 99"),
  porque Profundidade e Superfície eram somadas na mesma lista
- "Leitura feita por" gravado na coluna errada por um campo que não foi
  trocado ao duplicar o node de Update Row — ver Bug 19

### Security
- Conclusão de leitura bloqueada para o cargo Consultor, como os demais
  comandos de registro


## [0.6.0] - 2026-09-23

### Added
- Coleta de terra com vários tanques numa única mensagem (até 8), no
  mesmo padrão de lista + `Split Out` do `coleta_navio`; mensagem com um
  tanque só continua funcionando (compatível com o formato antigo)
- Registro de análises de tanque via WhatsApp (`Analise do normal/stress
  do(s) tanque(s) <lista> [navio <nome>], data <dd/mm/aaaa>`), aceitando
  lista de tanques (até 8 terra / 16 navio). Cada tanque gera 4 linhas
  na nova aba `ANALISES`: CT Profundidade, BL Profundidade, WORT
  Profundidade e WORT Superfície, com datas de pré-leitura e leitura
  final calculadas automaticamente
- Consulta de análises do dia (`Quais analises de tanques terra/navio
  saem hoje?`), agrupando por sub-análise + prazo em horas + tipo de
  frasco (Normal/Stress), com WORT Profundidade e Superfície juntos numa
  linha só (exibido como "Psicrotroficos")
- Cargo **Consultor**: acesso só de consulta, bloqueado de registrar
  coleta/análise
- Conclusão de drops em lote via WhatsApp (`Concluir drops [D5|D10|D15]
  terra|navio [nome do navio]`): muda para `Concluído` todas as linhas de
  `DROPS` pendentes com data prevista hoje que batem no filtro, e
  responde com a lista de tanques concluídos

### Changed
- Nomes de navio aceitam o número da viagem junto (ex: `O.SKY 123`), sem
  mudança de código: o nome já era capturado como texto livre

### Fixed
- Cálculo de "hoje" usando o relógio UTC do container: à noite (depois das
  21h em Brasília) as consultas do dia já olhavam o dia seguinte.
  Corrigido com `toLocaleDateString('pt-BR', { timeZone:
  'America/Sao_Paulo' })` em todos os Code nodes de consulta — ver Bug 12
- `Get rows` de aba vazia não repassava nenhum item e a execução parava
  em silêncio (visto em `COLETAS_NAVIO`); corrigido ativando "Always
  Output Data" — ver Bug 14
- Conexões erradas introduzidas ao religar o fluxo manualmente para o
  bloqueio de duplicata (drops de terra sem gravar, ramos de erro ligados
  a nodes de gravação, `HTTP Request` sem `Respond to Webhook`) — ver
  Bug 15

### Security
- Número não cadastrado na aba `USUARIOS` é bloqueado por completo:
  recebe mensagem pedindo cadastro e nenhum comando é executado (antes
  só o comando de cargo checava permissão)
- Bloqueio de coleta duplicada: mesmo tanque + mesma data de coleta (e
  mesmo navio, no caso de navio) é recusado, informando quem já
  registrou; se algum tanque da lista já existir, a mensagem inteira é
  recusada sem gravar nada

## [0.5.0] - 2026-09-21

### Added
- Deploy migrado de Docker local (PC) para stack própria e isolada num
  VPS Linux compartilhado, cedido por um administrador externo — ver
  `docs/deploy-vps.md` para a arquitetura completa
- Rede Docker isolada (`labflow-net`), sem nenhum serviço compartilhado
  com os outros containers do servidor
- Imagens fixadas por versão: `postgres:15-alpine`, `n8nio/n8n:2.38.6`,
  `evoapicloud/evolution-api` fixada por digest (não por tag `latest`)
- `docs/comandos.md`: referência de todos os comandos reconhecidos pelo
  bot, com formato e exemplo de cada um

### Changed
- Credencial da Evolution API migrada de chave fixa em cada node HTTP
  Request para uma Credencial Header Auth do n8n, eliminando o segredo
  em texto puro nos exports do workflow
- Credencial do Google Sheets migrada de OAuth2 (expira a cada 7 dias em
  modo de teste) para conta de serviço (não expira, sem dependência de
  login por navegador)
- Instância do WhatsApp recriada no Evolution API do servidor
  (`labflow2`, mesmo nome), com o número reparado via QR code

### Fixed
- Webhook configurado pela tela do Manager do Evolution API não estava
  sendo persistido (retornava `null` ao consultar via API); corrigido
  configurando via chamada direta à API (`POST /webhook/set/<instancia>`)
  — ver Bug 11 em `docs/troubleshooting.md`

### Security
- Todos os segredos da stack do VPS (senha do Postgres, chave da API,
  chave de criptografia do n8n) gerados diretamente no servidor via
  `openssl rand`, nunca transmitidos por fora do terminal SSH
- Nenhum serviço da stack exposto publicamente: acesso administrativo
  (n8n, Manager do Evolution) restrito a túnel SSH, portas publicadas
  apenas em `127.0.0.1`

## [0.4.0] - 2026-09-18

### Added
- Gerenciamento de usuários/cargos via WhatsApp (comando `adicionar/trocar
  cargo <nivel> para o numero <numero> [nome <nome>]`, restrito a Admin),
  com aba `USUARIOS` no Google Sheets como fonte única de permissões
- Gravação via upsert (Append or Update Row): cria linha nova ou atualiza
  a existente sem duplicar
- Nome do usuário capturado automaticamente do WhatsApp ao alterar o
  próprio cadastro, ou informado manualmente ao cadastrar outra pessoa
  que ainda não mandou mensagem nenhuma
- Sincronização automática do campo `Nome`: qualquer usuário já
  cadastrado que manda qualquer mensagem (não só o comando de cargo) tem
  o nome atualizado sozinho na `USUARIOS`

### Fixed
- `HTTP Request` do caminho de sucesso lendo `$json.textoResposta` do
  node errado (o node de gravação no Sheets, em vez do Code node) depois
  de inserir a etapa de escrita nesse branch — causava erro 400 na
  Evolution API e execução duplicada por retry automático do webhook

### Changed
- Code node principal migrado de "Run Once for Each Item" para "Run Once
  for All Items", pra conseguir carregar a lista de usuários como entrada
  adicional junto com o payload do webhook

## [0.3.0] - 2026-09-17

### Added
- Rastreio de arquivo/descarte: novas abas `BAGS_TERRA` e `POTES_NAVIO`,
  calculando data de descarte previsto (data da coleta + 365 dias)
- Comandos de consulta `quais bags posso descartar hoje` e `quais potes
  navio posso descartar hoje`
- Validação de formato nos branches `coleta_terra` e `coleta_navio`
  (antes só o branch `amostra` tinha esse tratamento)

### Fixed
- Consulta de drops sempre retornando "nenhum drop previsto": comparação
  de campos da planilha `DROPS` era case-sensitive e não batia com o
  cabeçalho real (colunas em maiúsculas)
- IDs de drop duplicados entre tanques diferentes do mesmo navio:
  `Date.now()` trocado por composição a partir do `idColeta` (já único
  por tanque)

## [0.2.0] - 2026-09-16

### Added
- Suporte a `coleta_navio`: registro de 1 a 16 tanques de uma vez numa
  única mensagem, gerando uma linha por tanque em `COLETAS_NAVIO`
- Cálculo automático de datas de drop (D5/D10/D15), reaproveitado entre
  os branches `coleta_terra` e `coleta_navio`
- ID único por registro (`idRegistro`, formato `AM-<timestamp>`) e nome
  do responsável (via `pushName` da Evolution API) gravados na planilha

## [0.1.0] - MVP inicial - 2026-09-14

### Added
- Fluxo inicial: webhook da Evolution API → parsing de `amostra` via
  regex num Code node → validação → gravação no Google Sheets →
  confirmação de volta no WhatsApp

### Fixed
- Loop de mensagens / instância travando por resync de histórico do
  WhatsApp Multi-Device
- Filter nativo do n8n descartando mensagens reais por causa do campo
  `status`
- Resposta de confirmação indo pro número errado (campo `sender` da
  Evolution API é o número da própria instância, não de quem enviou)

<!--
  Nota: as versões 0.1.0 a 0.3.0 acima foram reconstruídas a partir das
  datas registradas em docs/troubleshooting.md — ajusta se lembrar de
  algo com data diferente. A entrada 0.1.0 provavelmente cobre mais coisa
  do que só os 3 bugs listados (o que estava no seu arquitetura.md antes
  de virar troubleshooting.md) — vale completar com o que fez sentido pra
  você marcar como "MVP".
-->
