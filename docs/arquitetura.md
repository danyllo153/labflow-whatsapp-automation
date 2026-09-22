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
cada restart a Evolution API ressincronizava esse histórico como eventos
novos.

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

## MVP V3 — Coleta de terra e coleta de navio, cálculo de Drops

Adicionado um node Switch (mode: Rules) logo após o Code node, roteando por
um campo `tipo` que o Code node passa a determinar (uma expressão regular
por intenção reconhecida). O fluxo, que antes tinha um único caminho
(amostra), passou a ter múltiplos branches independentes, cada um com seu
próprio trio de validação (If) e resposta (Edit Fields/HTTP Request/Respond
to Webhook).

Branch `coleta_terra`: reconhece mensagens no formato "registrar coleta
tanque terra <número> data <dd/mm/aaaa>". Grava uma linha por coleta na aba
COLETAS e calcula automaticamente 3 datas de "drop" de reanálise (D5, D10,
D15 — coleta + 5/10/15 dias corridos), gravadas na aba DROPS.

Branch `coleta_navio`: reconhece "Coleta navio <nome> tanques <lista
separada por vírgula> data <dd/mm/aaaa>", aceitando de 1 a 16 tanques numa
única mensagem. Gera uma linha por tanque na aba COLETAS_NAVIO e reaproveita
a mesma função de cálculo de drops do branch de terra, gravando na mesma
aba DROPS (diferenciada por colunas Tipo Tanque/Navio, sem precisar de join
entre abas na hora de consultar).

Decisão de design: os dois branches de coleta reaproveitam a mesma função
`calcularDrops(dataColeta, idColeta, tanque, tipoTanque, navio)` dentro do
Code node, parametrizada por tipo/navio, em vez de duplicar a lógica de
cálculo de data.

Branch `consulta_drops`: reconhece "drops hoje" e variações. Lê a aba DROPS
inteira (Get rows, sem filtro) e um segundo Code node ("Montar resposta
drops", Run Once for All Items) filtra as linhas com Data Prevista = hoje,
agrupa por Dia Drop e separa terra/navio.

Limitação conhecida (corrigida depois): inicialmente só o branch `amostra`
tinha validação de campos obrigatórios antes de gravar; `coleta_terra` e
`coleta_navio` gravavam mesmo com dados incompletos. Resolvido adicionando
um If de validação em cada um dos dois branches, no mesmo padrão do branch
`amostra` (ver MVP V3 — Concluído).

## MVP V3 — Concluído

Testado ponta a ponta via WhatsApp real (Evolution API):
- `coleta_terra`: mensagem completa gravada corretamente em COLETAS + 3
  linhas em DROPS, confirmação recebida com as datas de drop calculadas
  certas.
- `coleta_navio`: mensagem com 5 tanques gerou 5 linhas em COLETAS_NAVIO e
  15 linhas em DROPS (5×3), confirmação recebida com lista de tanques e
  total.
- `consulta_drops`: "drops hoje" retornou corretamente os drops pendentes
  do dia, combinando terra e navio na mesma resposta, sem precisar de join
  entre as abas.
- Validação de formato inválido testada nos dois branches de coleta, cada
  um retornando mensagem de erro específica sem gravar nada.

## MVP V4 — Rastreio de arquivo/descarte (bags de terra e potes de navio)

Nova função `calcularArquivo(dataColetaStr, idColeta, tanque, navio)` no
Code node, no mesmo padrão de `calcularDrops`, calculando uma única data de
descarte previsto (coleta + 365 dias corridos). `coleta_terra` passou a
gravar também na aba nova BAGS_TERRA; `coleta_navio` na aba nova
POTES_NAVIO (uma linha por tanque).

Dois branches de consulta novos no Switch, espelhando `consulta_drops`:
`consulta_bags` ("quais bags posso descartar hoje") e `consulta_potes`
("quais potes navio posso descartar hoje"), cada um lendo sua aba (sem
filtro) e filtrando por Data Descarte Prevista = hoje e Status != Descartado
num Code node dedicado. Consulta é só leitura — a marcação de Status como
Descartado é feita manualmente na planilha.

## MVP V4 — Concluído

Testados os quatro caminhos via WhatsApp: gravação de bag (terra),
gravação de pote (navio), consulta de bags vazia e com item pendente,
consulta de potes vazia e com item pendente — todos bateram com o
esperado.

## MVP V5 — Gerenciamento de usuários e permissões via WhatsApp

Decisão de design: em vez de uma lista de usuários fixa no código (cogitada
inicialmente, mas incompatível com um comando que precisa escrever/alterar
cargos em tempo real), os usuários e seus cargos (Admin/Operador) passaram
a viver numa aba nova USUARIOS (Numero | Nome | Nivel) no Google Sheets,
como fonte única da verdade.

Novo node Get rows USUARIOS, inserido entre Filter e Code in JavaScript,
lendo a aba inteira a cada mensagem recebida. Isso mudou o modo de execução
do Code in JavaScript de "Run Once for Each Item" para "Run Once for All
Items", já que o input principal do node passou a ser as linhas da
USUARIOS em vez do payload do webhook — que agora é referenciado
explicitamente via `$('Webhook').first().json`.

Novo branch `gerenciar_usuario` no Switch, reconhecendo o comando
"adicionar/trocar/mudar cargo <nivel> para o numero <numero> [nome
<nome>]", restrito a remetentes com Nivel = Admin na USUARIOS. Gravação via
operação "Append or Update Row" do node Google Sheets (upsert nativo,
matching column = Numero) — cria a linha se o número for novo, ou atualiza
se já existir, sem precisar de lógica condicional própria pra decidir entre
Append e Update.

Sincronização automática de nome: um segundo caminho, paralelo ao Switch
(dois fios saindo da mesma saída do Code in JavaScript, não em série),
atualiza sozinho o campo Nome de qualquer remetente já cadastrado sempre
que o pushName do WhatsApp daquela mensagem difere do que está salvo — sem
nunca criar cadastro novo por essa via.

## MVP V5 — Concluído

Testado via WhatsApp real: alteração de cargo por Admin (sucesso),
atualização de cargo já existente sem duplicar linha (upsert), cargo
inválido rejeitado, usuário Operador bloqueado de alterar cargos (inclusive
o próprio, evitando autopromoção), sincronização automática do nome
validada, e regressão dos branches antigos (amostra, coleta_navio,
consulta_drops) confirmada sem mudança de comportamento após a troca de
modo do Code node.

## Arquitetura atual (resumo)

```
Webhook (Evolution API)
  → Filter (fromMe = false AND message.conversation exists)
  → Get rows USUARIOS (lê aba inteira)
  → Code in JavaScript (Run Once for All Items — guards, parsing por
    regex de 7 intenções, cálculo de drops/arquivo, checagem de
    permissão, sinalização de sincronização de nome)
      ├─ Switch → amostra | coleta_terra | coleta_navio | consulta_drops |
      │           consulta_bags | consulta_potes | gerenciar_usuario
      │           (cada um com seu próprio trio de validação/gravação/resposta)
      └─ If sincronizarNome → Append or Update Row (USUARIOS, só Nome) —
          caminho paralelo, não retorna resposta ao WhatsApp
```

Detalhes de cada branch, bugs encontrados e lições de debugging estão
documentados em `docs/troubleshooting.md`.

---

## Infraestrutura de deploy (VPS)

A partir de 21/09/2026, o LabFlow deixou de rodar em Docker local e passou
a rodar numa stack própria e isolada num VPS Linux compartilhado (cedido
por um administrador externo, que também hospeda outros serviços dele no
mesmo servidor).

**Resumo da mudança:**
- n8n, Postgres e Evolution API próprios, numa rede Docker isolada
  (`labflow-net`), sem nenhum serviço compartilhado com o resto do
  servidor.
- Nenhuma porta exposta publicamente — todo acesso administrativo (editor
  do n8n, Manager do Evolution) é feito por túnel SSH.
- Segredos (senha do Postgres, chave da API, chave de criptografia do
  n8n) gerados diretamente no servidor via `openssl`, nunca transmitidos
  por fora do terminal.
- Credencial do Evolution migrada de "chave fixa no node" para uma
  Credencial Header Auth do n8n; credencial do Google Sheets migrada de
  OAuth2 (expira a cada 7 dias em modo de teste) para conta de serviço
  (não expira).
- A lógica do workflow (nodes, regex, regras de negócio descritas acima
  nesta página) **não mudou** na migração — só a infraestrutura por trás
  dela.

A arquitetura completa da infraestrutura (diagrama de rede, gestão de
segredos, processo de migração passo a passo e troubleshooting específico
de infraestrutura) está documentada em `docs/deploy-vps.md`.
