## Node 1 — Webhook (entrada)

Recebe as mensagens simulando o WhatsApp via HTTP POST. Endpoint de teste: `/webhook-test/labflow-registro`.

## Node 2 — Interpretação (Code node)

Extrai amostra, análise e data da mensagem de texto usando expressões regulares (regex).

Abordagem escolhida: regex em vez de IA nesta primeira versão, para manter o fluxo simples e previsível no MVP. IA entra na V3, para lidar com linguagem mais natural e variável.

Limitação conhecida: só reconhece mensagens em formato relativamente estruturado (ex: "Registrar amostra X, analise Y, data Z"). Mensagens muito diferentes desse padrão não são reconhecidas — resolvido na versão com IA.

## Node 3 — Validação (IF)

Verifica se os três campos obrigatórios (amostra, analise, data) foram extraídos com sucesso, usando a condição "is not empty" combinada com AND.

- Se todos os campos estão presentes → segue pela saída True (rumo à gravação no Google Sheets)
- Se algum campo está ausente (null) → segue pela saída False (rumo a uma mensagem de erro para o usuário)

**Testes realizados:**
- Mensagem completa ("Registrar amostra 2458, analise acidofilos, data 09/09/2026") → saiu corretamente pela True Branch
- Mensagem incompleta ("Registrar amostra 3000") → saiu corretamente pela False Branch, com analise e data como null

Isso confirma que o sistema não grava registros incompletos silenciosamente, conforme planejado na seção de segurança e validação do projeto.

## Node 4 — Gravação (Google Sheets)

Conectado via credencial OAuth2, configurada em um projeto próprio no Google Cloud Console (necessário porque o n8n roda self-hosted localmente via Docker, diferente do n8n Cloud que já vem com integração pré-configurada).

Planilha: "LabFlow - Dados", aba "AMOSTRAS", com colunas: ID, Amostra, Analise, Data Entrada, Status, Responsavel, Observacao.

Ação usada: "Append row in sheet" — adiciona uma nova linha a cada registro válido.

## MVP funcional — primeiro teste ponta a ponta

Fluxo completo testado com sucesso: mensagem simulada via webhook → parsing por regex → validação IF (True Branch) → gravação no Google Sheets.

Linha registrada na aba AMOSTRAS: Amostra 2458, Analise acidofilos, Data Entrada 09/09/2026, Status Pendente.

## Node 5 — Mensagem de erro (Edit Fields, caminho False)

Quando a validação falha (algum campo obrigatório ausente), monta um campo "Resposta" com uma mensagem de erro fixa, informando ao usuário que faltam dados.

Mensagem atual: genérica (não indica especificamente qual campo faltou).

Melhoria futura documentada: tornar a mensagem dinâmica, apontando exatamente quais campos (amostra, analise, data) não foram reconhecidos na mensagem original.

## MVP V1 — Concluído

Fluxo completo funcionando de ponta a ponta, testado via requisições HTTP simulando o WhatsApp:

**Cenário de sucesso** (dados completos):
- Entrada: "Registrar amostra 2458, analise acidofilos, data 09/09/2026"
- Resultado: linha gravada na planilha AMOSTRAS + resposta de confirmação retornada diretamente na chamada HTTP

**Cenário de erro** (dados incompletos):
- Entrada: "Registrar amostra 3000"
- Resultado: nenhuma gravação na planilha + mensagem de erro retornada diretamente na chamada HTTP

**Arquitetura final:**
Webhook → Code (parsing por regex) → IF (validação) → [True: Google Sheets + Edit Fields de sucesso | False: Edit Fields de erro] → Respond to Webhook

Configuração do Webhook alterada de "Respond Immediately" para "Using Respond to Webhook Node", permitindo que a resposta HTTP dependa do resultado do processamento — o mesmo padrão usado por qualquer API REST real.

## Incidente e correção — persistência de dados

O container labflow-n8n foi perdido inesperadamente (nome trocado para um aleatório pelo Docker). O workflow foi recuperado sem perdas graças ao volume n8n_data, criado desde o início.

Aproveitando o incidente, o Postgres da Evolution API (que não tinha volume configurado) foi recriado com um volume dedicado (labflow_postgres_data), prevenindo perda de dados em caso de problema semelhante no futuro.

Lição: todo container que guarda estado (n8n, Postgres) deve ter volume configurado desde a criação.

## MVP V2 — Integração real com WhatsApp (Evolution API)

Substituído o webhook simulado por integração real com WhatsApp Business via
Evolution API v2 (self-hosted, Docker + Postgres). Fluxo evoluído para:
Webhook (Evolution API) → Filter → Code (parsing regex + guards) → IF
(validação) → [True: Google Sheets + Edit Fields + HTTP Request (reply) |
False: Edit Fields erro + HTTP Request (reply erro)] → Respond to Webhook.

Adicionados ao registro: ID único por amostra (`AM-<timestamp>`, campo
`idRegistro`) e nome do responsável (`nomeContato`, extraído do `pushName`
da Evolution API), ambos gravados na planilha AMOSTRAS.

## Incidente e correção — loop de mensagens por sync de histórico

A instância `labflow` entrou em loop, reenviando mensagens antigas
(inclusive um teste de dias atrás) como se fossem novas. Causa: a instância
foi conectada primeiro ao número errado, depois reconectada ao número
correto; o histórico da conexão errada ficou persistido no Postgres, e a
cada restart o WhatsApp ressincronizava esse histórico como eventos novos.

Correção inicial: apagar a instância contaminada e recriar do zero
(`labflow2`), conectando direto no número correto.

Descoberta seguinte: mesmo numa instância nova, a sincronização de
histórico ao parear é comportamento **padrão** do protocolo WhatsApp
Multi-Device (via Baileys) — não é bug exclusivo da instância antiga.
Solução definitiva em duas camadas: (1) configuração da instância via
`/settings/set` da Evolution API (`syncFullHistory: false`, `readMessages:
false`, `alwaysOnline: false`); (2) guardas no Code node do n8n, descartando
mensagens com `fromMe: true` ou com `messageTimestamp` mais antigo que 10
minutos — tornando o fluxo resiliente a qualquer sync futuro.

## Incidente e correção — Filter descartando mensagens reais

O node Filter (condição `status is empty`) estava descartando mensagens
reais, porque o campo `status` da Evolution API às vezes já vem preenchido
(`DELIVERY_ACK`) mesmo na primeira notificação de uma mensagem legítima.
Corrigido trocando a condição para `data.message.conversation exists` — um
critério mais confiável de "isso é uma mensagem de verdade".

## Incidente e correção — resposta indo para o número errado

A confirmação de "amostra registrada" chegava no próprio número Business em
vez de voltar para quem enviou. Causa: o campo `number` do HTTP Request de
resposta usava `body.sender`, que na Evolution API representa o número **da
própria instância**, não o remetente — nome de campo enganoso. Corrigido
usando `data.key.remoteJid` (capturado no Code node como `numero`).

## Incidente e correção — planilha gravando fora do lugar

Depois de limpar linhas de teste usando "Limpar conteúdo" (em vez de
"Excluir linhas"), o Google Sheets manteve o intervalo de dados "usado"
inalterado, fazendo o Append Row gravar dezenas de linhas abaixo do
cabeçalho. Lição: sempre excluir as linhas de fato, não só o conteúdo, para
resetar o intervalo de dados da planilha.
