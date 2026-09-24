# Changelog

Todas as mudanças relevantes deste projeto (LabFlow — automação de registro
de amostras via WhatsApp) são documentadas aqui. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Pra detalhes de *como* cada bug foi encontrado e resolvido, ver
`docs/troubleshooting.md`. Pra entender a arquitetura atual do sistema, ver
`docs/arquitetura.md`. Pra detalhes da infraestrutura de deploy, ver
`docs/deploy-vps.md`. Este arquivo é só o resumo cronológico do que mudou.

## [Unreleased]

### Pendente
- `LabFlow.json` do repositório ainda é o export da v0.4.0; exportar a
  versão atual do workflow (já sem chave em texto puro, usando a
  Credencial Header Auth) e substituir

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
