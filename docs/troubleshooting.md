Troubleshooting: Integração WhatsApp (Evolution API) + n8n

Projeto: LabFlow — automação de registro de amostras via WhatsApp Data: Setembro/2026 Componentes: Evolution API v2 (self-hosted, Docker) + Postgres + n8n (self-hosted, Docker)

Este documento registra os bugs enfrentados durante a integração do WhatsApp Business (via Evolution API) com o fluxo de automação no n8n, a causa raiz de cada um e a solução aplicada. Serve como referência técnica e como registro do processo de debug para o portfólio do projeto.

Contexto

O fluxo recebe mensagens de WhatsApp via webhook da Evolution API, processa o texto com regex num Code node do n8n, valida os dados e grava numa planilha Google Sheets, respondendo ao remetente com uma confirmação.

Webhook → Filter → Code (parsing regex) → If (validação)
                                              ├─ true  → Append Sheets → Edit Fields → HTTP Request (reply) → Respond to Webhook
                                              └─ false → Edit Fields (erro) → HTTP Request (reply erro) → Respond to Webhook
Bug 1 — Loop de mensagens / instância travando

Sintoma: a instância labflow da Evolution API entrava em loop, reenviando mensagens antigas (inclusive uma mensagem de teste enviada dias antes) como se fossem novas, causando travamentos.

Causa raiz: a instância havia sido conectada primeiro ao número pessoal por engano, depois desconectada e reconectada ao número correto (WhatsApp Business). O histórico de conversa do período com o número errado ficou persistido no Postgres. A cada restart da Evolution API, o Baileys (motor por trás da Evolution API) fazia uma ressincronização de histórico com o WhatsApp e reenviava esse histórico antigo como eventos novos de webhook.

Solução aplicada: apagar a instância labflow (contaminada) e criar uma instância nova (labflow2), conectando diretamente com o número correto desde o início.

Resultado parcial: a instância nova também sincronizou um histórico significativo de mensagens ao ser pareada (295 mensagens), revelando que o problema real não era exclusivo da instância antiga — ver Bug 2.

Bug 2 — Sincronização de histórico é comportamento padrão do WhatsApp

Descoberta: mesmo numa instância nova e "limpa", ao parear o número, o protocolo do WhatsApp Web (Baileys) sincroniza automaticamente o histórico recente de conversas para o novo dispositivo vinculado. Isso não é um bug da Evolution API — é assim que o WhatsApp Multi-Device funciona nativamente. Apagar/recriar a instância não resolve sozinho.

Solução aplicada — duas camadas:

Configuração da instância, via endpoint de settings da Evolution API, para reduzir sincronização:
   POST /settings/set/{instancia}
   { "rejectCall": false, "msgCall": "", "groupsIgnore": false,
     "alwaysOnline": false, "readMessages": false, "readStatus": false,
     "syncFullHistory": false }

(a API exige o objeto completo de settings, não aceita campos parciais)

Filtro defensivo no n8n (Code node), para tornar o fluxo resiliente a qualquer sync futuro (reconexões, restarts):
Descarta mensagens onde fromMe: true (mensagens do próprio bot, incluindo sync de histórico marcado como enviado por ele mesmo)
Descarta mensagens com messageTimestamp mais antigo que 10 minutos
Bug 3 — Filter nativo descartando mensagens reais

Sintoma: mensagens de teste reais (enviadas de propósito, com conteúdo válido) estavam sendo descartadas pelo node Filter do n8n, nunca chegando ao Code node.

Causa raiz: o Filter tinha duas condições: fromMe is false AND status is empty. O campo status do payload da Evolution API nem sempre vem vazio em mensagens reais — o WhatsApp pode já entregar o evento com status: "DELIVERY_ACK" mesmo sendo a primeira e única notificação daquela mensagem. Isso fazia mensagens legítimas serem tratadas como "eventos de status" e descartadas.

Solução aplicada: trocar a condição de status is empty por data.message.conversation exists — um critério mais confiável, que verifica se existe conteúdo de mensagem de verdade, independente do status de entrega.

Bug 4 — Resposta de confirmação indo para o número errado

Sintoma: o fluxo processava a mensagem e gravava na planilha corretamente, mas a confirmação de "amostra registrada" nunca chegava no WhatsApp de quem enviou — em vez disso, aparecia como mensagem enviada pelo próprio número Business para si mesmo.

Causa raiz: o campo number do node HTTP Request (usado para enviar a resposta via Evolution API) estava configurado como {{ $('Webhook').item.json.body.sender }}. O campo sender do payload da Evolution API é, na verdade, o número da própria instância (quem recebeu a mensagem), não o número de quem enviou — um nome de campo enganoso.

Solução aplicada: usar data.key.remoteJid (capturado no Code node como campo numero) como destino da resposta:

javascript
const numeroRemetente = data.key.remoteJid;
{{ $('Code in JavaScript').item.json.numero.replace('@s.whatsapp.net', '') }}
Bug 5 — Erro de sintaxe (chave sobrando) no Code node

Sintoma: SyntaxError: Illegal return statement ao executar o Code node, mesmo com a lógica aparentemente correta.

Causa raiz: uma chave de fechamento } duplicada logo após o objeto dadosExtraidos, fechando o escopo da função do node antes da linha de return, o que tornava o return seguinte sintaticamente inválido.

Solução aplicada: remoção da linha com a chave extra.

Lição: ao colar/editar trechos de código em partes (guard clauses + lógica principal + return final), sempre revisar o balanceamento de chaves do arquivo inteiro antes de salvar.

Bug 6 — Linhas novas aparecendo no meio da planilha, não logo após o cabeçalho

Sintoma: depois de "limpar" linhas de teste na planilha, novas linhas gravadas pelo Append Row apareciam dezenas de linhas abaixo do cabeçalho (ex: linha 58), em vez de na linha 2.

Causa raiz: limpar apenas o conteúdo das células (Ctrl+Delete / "Limpar conteúdo") não reduz o intervalo de dados "usado" internamente pelo Google Sheets. O node Append Row do n8n insere a nova linha após o último registro dentro desse intervalo usado, que continuava "grande" mesmo com as células vazias.

Solução aplicada: selecionar as linhas antigas e usar "Excluir linhas" (não "Limpar conteúdo") — isso de fato reduz o intervalo de dados da planilha, e o Append Row volta a escrever logo após o cabeçalho.

Melhorias adicionais implementadas
ID único por registro (idRegistro, formato AM-<timestamp>), gerado no Code node — serve como chave de referência estável para vincular esse registro a futuras funcionalidades (ex: cálculo de "drops" de reanálise), independente da posição da linha na planilha.
Nome do responsável (nomeContato, do campo pushName da Evolution API) gravado na coluna "Responsavel" da planilha, para rastrear quem enviou cada registro.
Arquitetura final do fluxo (n8n)
Webhook (Evolution API)
  → Filter (fromMe = false AND message.conversation exists)
  → Code in JavaScript (guards de fromMe/timestamp + parsing regex + ID + nome)
  → If (validação dos campos extraídos)
       ├─ true  → Append Row (Google Sheets) → Edit Fields (texto de sucesso)
       │           → HTTP Request (reply via Evolution API, number = numero do Code node)
       │           → Respond to Webhook
       └─ false → Edit Fields (texto de erro) → HTTP Request (reply de erro)
                   → Respond to Webhook
Configuração da instância Evolution API (recomendada)
json
{
  "rejectCall": false,
  "msgCall": "",
  "groupsIgnore": false,
  "alwaysOnline": false,
  "readMessages": false,
  "readStatus": false,
  "syncFullHistory": false
}

docs: adiciona troubleshooting da integração Evolution API
