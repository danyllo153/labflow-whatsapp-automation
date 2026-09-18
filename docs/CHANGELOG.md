# Changelog

Todas as mudanças relevantes deste projeto (LabFlow — automação de registro
de amostras via WhatsApp) são documentadas aqui. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Pra detalhes de *como* cada bug foi encontrado e resolvido, ver
`docs/troubleshooting.md`. Pra entender a arquitetura atual do sistema, ver
`docs/arquitetura.md`. Este arquivo é só o resumo cronológico do que mudou.

## [Unreleased]

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
