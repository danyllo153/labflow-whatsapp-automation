# Troubleshooting: Integração WhatsApp (Evolution API) + n8n

**Projeto:** LabFlow — automação de registro de amostras via WhatsApp
**Data:** Setembro/2026
**Componentes:** Evolution API v2 (self-hosted, Docker) + Postgres + n8n (self-hosted, Docker)

Este documento registra os bugs enfrentados durante a integração do WhatsApp
Business (via Evolution API) com o fluxo de automação no n8n, a causa raiz de
cada um e a solução aplicada. Serve como referência técnica e como registro
do processo de debug para o portfólio do projeto.

Para bugs específicos da infraestrutura do deploy no VPS (rede, segredos,
webhook não persistindo), ver a seção "Bug 11" ao final deste documento e
`docs/deploy-vps.md`.

---

## Contexto

O fluxo recebe mensagens de WhatsApp via webhook da Evolution API, processa o
texto com regex num Code node do n8n, valida os dados e grava numa planilha
Google Sheets, respondendo ao remetente com uma confirmação.

```
Webhook → Filter → Code (parsing regex) → If (validação)
                                              ├─ true  → Append Sheets → Edit Fields → HTTP Request (reply) → Respond to Webhook
                                              └─ false → Edit Fields (erro) → HTTP Request (reply erro) → Respond to Webhook
```

---

## Bug 1 — Loop de mensagens / instância travando

**Sintoma:** a instância `labflow` da Evolution API entrava em loop,
reenviando mensagens antigas (inclusive uma mensagem de teste enviada dias
antes) como se fossem novas, causando travamentos.

**Causa raiz:** a instância havia sido conectada primeiro ao número pessoal
por engano, depois desconectada e reconectada ao número correto (WhatsApp
Business). O histórico de conversa do período com o número errado ficou
persistido no Postgres. A cada restart da Evolution API, o Baileys (motor
por trás da Evolution API) fazia uma ressincronização de histórico com o
WhatsApp e reenviava esse histórico antigo como eventos novos de webhook.

**Solução aplicada:** apagar a instância `labflow` (contaminada) e criar uma
instância nova (`labflow2`), conectando diretamente com o número correto
desde o início.

**Resultado parcial:** a instância nova também sincronizou um histórico
significativo de mensagens ao ser pareada (295 mensagens), revelando que o
problema real não era exclusivo da instância antiga — ver Bug 2.

---

## Bug 2 — Sincronização de histórico é comportamento padrão do WhatsApp

**Descoberta:** mesmo numa instância nova e "limpa", ao parear o número, o
protocolo do WhatsApp Web (Baileys) sincroniza automaticamente o histórico
recente de conversas para o novo dispositivo vinculado. Isso não é um bug da
Evolution API — é assim que o WhatsApp Multi-Device funciona nativamente.
Apagar/recriar a instância não resolve sozinho.

**Solução aplicada — duas camadas:**

1. **Configuração da instância**, via endpoint de settings da Evolution API,
   para reduzir sincronização:
   ```
   POST /settings/set/{instancia}
   { "rejectCall": false, "msgCall": "", "groupsIgnore": false,
     "alwaysOnline": false, "readMessages": false, "readStatus": false,
     "syncFullHistory": false }
   ```
   (a API exige o objeto completo de settings, não aceita campos parciais)

2. **Filtro defensivo no n8n** (Code node), para tornar o fluxo resiliente a
   qualquer sync futuro (reconexões, restarts):
   - Descarta mensagens onde `fromMe: true` (mensagens do próprio bot,
     incluindo sync de histórico marcado como enviado por ele mesmo)
   - Descarta mensagens com `messageTimestamp` mais antigo que 10 minutos

---

## Bug 3 — Filter nativo descartando mensagens reais

**Sintoma:** mensagens de teste reais (enviadas de propósito, com conteúdo
válido) estavam sendo descartadas pelo node **Filter** do n8n, nunca
chegando ao Code node.

**Causa raiz:** o Filter tinha duas condições: `fromMe is false` **AND**
`status is empty`. O campo `status` do payload da Evolution API nem sempre
vem vazio em mensagens reais — o WhatsApp pode já entregar o evento com
`status: "DELIVERY_ACK"` mesmo sendo a primeira e única notificação daquela
mensagem. Isso fazia mensagens legítimas serem tratadas como "eventos de
status" e descartadas.

**Solução aplicada:** trocar a condição de `status is empty` por
`data.message.conversation exists` — um critério mais confiável, que
verifica se existe conteúdo de mensagem de verdade, independente do status
de entrega.

---

## Bug 4 — Resposta de confirmação indo para o número errado

**Sintoma:** o fluxo processava a mensagem e gravava na planilha
corretamente, mas a confirmação de "amostra registrada" nunca chegava no
WhatsApp de quem enviou — em vez disso, aparecia como mensagem enviada pelo
próprio número Business para si mesmo.

**Causa raiz:** o campo `number` do node HTTP Request (usado para enviar a
resposta via Evolution API) estava configurado como
`{{ $('Webhook').item.json.body.sender }}`. O campo `sender` do payload da
Evolution API é, na verdade, o número **da própria instância** (quem
recebeu a mensagem), não o número de quem enviou — um nome de campo
enganoso.

**Solução aplicada:** usar `data.key.remoteJid` (capturado no Code node como
campo `numero`) como destino da resposta:
```javascript
const numeroRemetente = data.key.remoteJid;
```
```
{{ $('Code in JavaScript').item.json.numero.replace('@s.whatsapp.net', '') }}
```

**Recaída (mesmo bug, node diferente):** dias depois, o erro
`instance requires property "number"` voltou a aparecer em execuções
(23:31–23:36), mas o node com a borda vermelha era o `HTTP Request2`, não o
`HTTP Request` original. Causa: o fluxo cresceu para ter **três** nodes de
resposta distintos (`HTTP Request`, `HTTP Request1`, `HTTP Request2`), um
por branch (erro/sucesso do fluxo `amostra`, e a resposta do fluxo
`coleta_terra` — ver arquitetura abaixo). Cada `HTTP Request` node é uma
cópia independente, sem herdar configuração dos outros — a correção do
campo `number` feita num deles não se propaga automaticamente para os
demais. `HTTP Request2` ainda estava com a expressão antiga/errada.

**Solução aplicada:** replicar a mesma expressão de `number`
(`{{ $('Code in JavaScript').item.json.numero.replace('@s.whatsapp.net', '') }}`)
em todos os nodes HTTP Request que respondem ao WhatsApp.

**Lição:** ao adicionar um novo branch/node HTTP Request que envia resposta
via Evolution API, sempre conferir manualmente o campo `number` — não existe
herança de configuração entre nodes duplicados no n8n.

---

## Bug 5 — Erro de sintaxe (chave sobrando) no Code node

**Sintoma:** `SyntaxError: Illegal return statement` ao executar o Code
node, mesmo com a lógica aparentemente correta.

**Causa raiz:** uma chave de fechamento `}` duplicada logo após o objeto
`dadosExtraidos`, fechando o escopo da função do node antes da linha de
`return`, o que tornava o `return` seguinte sintaticamente inválido.

**Solução aplicada:** remoção da linha com a chave extra.

**Lição:** ao colar/editar trechos de código em partes (guard clauses +
lógica principal + return final), sempre revisar o balanceamento de chaves
do arquivo inteiro antes de salvar.

---

## Bug 6 — Linhas novas aparecendo no meio da planilha, não logo após o cabeçalho

**Sintoma:** depois de "limpar" linhas de teste na planilha, novas linhas
gravadas pelo Append Row apareciam dezenas de linhas abaixo do cabeçalho
(ex: linha 58), em vez de na linha 2.

**Causa raiz:** limpar apenas o **conteúdo** das células (Ctrl+Delete /
"Limpar conteúdo") não reduz o intervalo de dados "usado" internamente pelo
Google Sheets. O node Append Row do n8n insere a nova linha após o último
registro dentro desse intervalo usado, que continuava "grande" mesmo com as
células vazias.

**Solução aplicada:** selecionar as linhas antigas e usar **"Excluir
linhas"** (não "Limpar conteúdo") — isso de fato reduz o intervalo de dados
da planilha, e o Append Row volta a escrever logo após o cabeçalho.

---

## Bug 7 — Edição no Code node não persistiu (workflow não salvo)

**Sintoma:** depois de colar um bloco novo de parsing (`coleta_navio`) no
`Code in JavaScript` e testar, a mensagem de teste foi classificada como
`amostra` em vez de `coleta_navio` — caiu no fluxo de validação de amostra e
voltou o erro genérico ("Verifique se amostra, analise e data foram
informados corretamente"), mesmo o código novo parecendo correto.

**Causa raiz:** fechar o painel do node no editor do n8n não salva o
workflow — é preciso salvar o workflow inteiro (botão "Save" no topo do
editor, ou `Ctrl+S`) depois de editar um node. Sem isso, a execução real
continua rodando a versão anterior do código.

**Solução aplicada:** reabrir o Code node pra confirmar que o bloco novo
ainda estava lá, salvar o workflow explicitamente, e testar de novo — a
segunda tentativa classificou corretamente como `coleta_navio`.

**Lição:** depois de editar qualquer node (principalmente Code node, onde
não tem feedback visual óbvio de "não salvo"), salvar o workflow inteiro
antes de testar — não confiar que fechar o painel já persiste a mudança.

---

## Bug 8 — Consulta de drops sempre retornando "nenhum drop previsto"

**Sintoma:** mesmo editando manualmente a `Data Prevista` de linhas da
DROPS para a data de hoje, a consulta (`drops hoje`) sempre respondia
"Nenhum drop previsto para hoje", nunca encontrando as linhas.

**Causa raiz:** os cabeçalhos reais da aba DROPS estão em **maiúsculas**
(`DATA PREVISTA`, `DIA DROP`, `TANQUE`, `TIPO TANQUE`, `NAVIO`, `STATUS`),
mas o Code node de agregação lia os campos em Title Case
(`item.json['Data Prevista']`, `item.json['Dia Drop']` etc). Como nome de
propriedade é case-sensitive em JavaScript, essas leituras sempre voltavam
`undefined`, e a comparação com a data de hoje nunca batia — independente
de qual data estivesse realmente na planilha.

**Solução aplicada:** ajustar todas as referências de campo no Code node
para o nome exato das colunas (todo em maiúsculas), igual ao que o node
`Get rows DROPS` realmente devolve.

**Lição:** ao referenciar campos vindos de um node Google Sheets, conferir
o nome exato das colunas (via "Execute step" no node, olhando o JSON de
saída) em vez de assumir a capitalização — nome de campo errado não dá erro
de execução, só retorna `undefined` silenciosamente, o que é mais difícil
de diagnosticar que um node vermelho.

---

## Bug 9 — IDs de drop duplicados entre tanques do mesmo navio

**Sintoma:** ao conferir os dados da DROPS, vários tanques diferentes de
uma mesma coleta de navio (ex: 1C, 2P, 2S, 3P, 3S) tinham o **mesmo** valor
na coluna `ID` para o mesmo dia de drop (ex: todos os D5 com
`DR-1789601117290-5`).

**Causa raiz:** dentro de `calcularDrops`, o `idDrop` era gerado como
`` `DR-${Date.now()}-${offset}` ``. Como a função é chamada uma vez por
tanque dentro de um `forEach` síncrono (loop de até 16 tanques rodando em
milissegundos), `Date.now()` frequentemente retorna o mesmo valor pra
tanques diferentes, gerando IDs colididos entre eles.

**Solução aplicada:** trocar para `` `DR-${idColeta}-${offset}` `` — como
`idColeta` já é único por tanque (gerado com índice do loop), o `idDrop`
passa a ser único também, e fica semanticamente amarrado à coleta que o
originou.

**Lição:** `Date.now()` não é confiável como fonte de unicidade dentro de
loops síncronos rápidos — preferir compor o ID a partir de algo que já é
garantidamente único (como um ID de registro pai + um índice/sufixo) em vez
de depender de timestamp sozinho.

---

## Melhorias adicionais implementadas

- **ID único por registro** (`idRegistro`, formato `AM-<timestamp>`),
  gerado no Code node — serve como chave de referência estável para
  vincular esse registro a futuras funcionalidades (ex: cálculo de "drops"
  de reanálise), independente da posição da linha na planilha.
- **Nome do responsável** (`nomeContato`, do campo `pushName` da Evolution
  API) gravado na coluna "Responsavel" da planilha, para rastrear quem
  enviou cada registro.
- **Suporte a coleta de navio** (`coleta_navio`): uma mensagem registra de
  1 a 16 tanques de uma vez (formato `Coleta navio <nome> tanques
  <lista separada por vírgula> data <dd/mm/aaaa>`), gerando uma linha por
  tanque na aba COLETAS_NAVIO e 3 linhas de drop por tanque na mesma aba
  DROPS usada pela coleta de terra — reaproveitando a função `calcularDrops`
  já existente (que já aceita `tipoTanque` e `navio` como parâmetros,
  gravados direto em cada linha de DROPS). Isso evita precisar de um join
  entre DROPS e COLETAS_NAVIO na hora de consultar drops do dia.
- **Validação de formato nos branches de coleta** (`coleta_terra` e
  `coleta_navio`): adicionado um node `If` em cada branch, logo após o
  `Switch`, checando se os campos obrigatórios (número do tanque/nome do
  navio + data, no caso de navio também a lista de tanques) foram
  efetivamente extraídos pela regex do Code node. Antes, uma mensagem em
  formato inválido caía direto na gravação/resposta sem checagem alguma
  (ver assimetria apontada nas notas da arquitetura, agora corrigida).
  Quando a validação falha, cada branch responde com uma mensagem de erro
  específica, no mesmo padrão do branch `amostra`:
  - `coleta_terra`: `"❌ Não foi possível registrar a coleta de terra.
    Formato esperado: 'registrar coleta tanque terra <número> data
    <dd/mm/aaaa>'"`
  - `coleta_navio`: `"❌ Não foi possível registrar a coleta de navio.
    Formato esperado: 'Coleta navio <nome> tanques <lista separada por
    vírgula> data <dd/mm/aaaa>'"`
- **Rastreio de arquivo/descarte (bags de terra e potes de navio)**: nova
  função `calcularArquivo(dataColetaStr, idColeta, tanque, navio)` no Code
  node, no mesmo padrão de `calcularDrops`, mas calculando uma única data
  (`Data Descarte Prevista` = data da coleta + 365 dias corridos) em vez de
  três. `coleta_terra` gera um `bagArquivo` (1 por mensagem, já que é 1
  tanque por mensagem) gravado numa aba nova `BAGS_TERRA`; `coleta_navio`
  gera um array `arquivosNavio` (1 por tanque, dentro do mesmo loop que já
  gera `itensColeta` e `drops`) gravado numa aba nova `POTES_NAVIO` via um
  terceiro `Split Out` em paralelo. Duas novas intenções de consulta,
  espelhando `consulta_drops`: `consulta_bags` (regex `quais bags? (posso)?
  descartar hoje`) e `consulta_potes` (regex `quais potes? (do)? navio
  (posso)? descartar hoje`), cada uma com seu `Get rows` (sem filtro) +
  `Code` que filtra `Data Descarte Prevista = hoje` e `Status != Descartado`
  e monta a lista de tanques a descartar. Consulta é somente leitura — não
  marca `Status` como `Descartado` automaticamente, isso é feito manualmente
  na planilha.

---

## Arquitetura final do fluxo (n8n)

O fluxo trata sete tipos de mensagem (`amostra`, `coleta_terra`,
`coleta_navio`, `consulta_drops`, `consulta_bags`, `consulta_potes` e
`gerenciar_usuario`), roteados por um node **Switch**, cada um com seu
próprio trio de resposta (Edit Fields/campo pronto → HTTP Request →
Respond to Webhook) independente:

```
Webhook (Evolution API)
  → Filter (fromMe = false AND message.conversation exists)
  → Get rows USUARIOS (lê a aba inteira, sem filtro)
  → Code in JavaScript (Run Once for All Items — guards de fromMe/timestamp
                         + parsing regex das 7 intenções + ID + nome
                         + função calcularDrops(...) e calcularArquivo(...)
                         reaproveitadas pelos branches de coleta
                         + checagem de permissão (nivelAtual) via USUARIOS
                         + sinalização de sincronização de nome)
      ├─ Switch (mode: Rules)
      │      ├─ amostra           → If (validação) → sucesso/erro
      │      ├─ coleta_terra      → If (validação) → sucesso/erro
      │      ├─ coleta_navio      → If (validação) → sucesso/erro
      │      ├─ consulta_drops    → Get rows DROPS → Code (monta resposta)
      │      ├─ consulta_bags     → Get rows BAGS_TERRA → Code (monta resposta)
      │      ├─ consulta_potes    → Get rows POTES_NAVIO → Code (monta resposta)
      │      └─ gerenciar_usuario → If (autorizado)
      │             ├─ true  → Append or Update Row (USUARIOS) → HTTP Request → Respond to Webhook
      │             └─ false → HTTP Request → Respond to Webhook
      └─ If sincronizarNome (caminho paralelo, não retorna resposta)
             └─ true → Append or Update Row (USUARIOS, só Numero/Nome)
```

**Notas:**
- Os branches `coleta_terra` e `coleta_navio` passaram a ter um `If` de
  validação antes de gravar/responder, no mesmo padrão do branch `amostra`
  (ver "Melhorias adicionais implementadas" e a validação end-to-end do
  formato inválido, abaixo). Antes, qualquer mensagem desses tipos caía
  direto na resposta, sem tratamento de erro dedicado — essa assimetria foi
  corrigida.
- A aba DROPS é **compartilhada** entre `coleta_terra` e `coleta_navio`; a
  distinção entre os dois fica registrada em cada linha via as colunas
  `Tipo Tanque` (Terra/Navio) e `Navio` (nome do navio, vazio nas linhas de
  terra) — geradas direto pela `calcularDrops`, sem precisar de join com
  COLETAS_NAVIO na hora de consultar.
- `coleta_navio` aceita de 1 a 16 tanques numa única mensagem (formato
  `Coleta navio <nome> tanques <lista separada por vírgula> data
  <dd/mm/aaaa>`), gerando N linhas em COLETAS_NAVIO e N×3 linhas em DROPS a
  partir de um único item do Code node (usando dois `Split Out` em paralelo
  sobre os campos `itensColeta` e `drops`).
- O node `Get rows USUARIOS` e a checagem de permissão rodam pra **toda**
  mensagem recebida, não só pro comando `gerenciar_usuario` — é o que
  permite tanto autorizar o comando de cargo quanto sincronizar o nome de
  qualquer remetente já cadastrado, em paralelo ao roteamento normal do
  `Switch`.

**Validação end-to-end — coleta_terra (16/09/2026):** mensagem de teste
(Tanque 42, Data 16/09/2026) processada com sucesso: `Switch` roteou
corretamente, `Split Out` gerou os 3 items de drop, `Append Row in sheet1`
(COLETAS) e `Append Row in sheet2` (DROPS) gravaram os registros, e a
confirmação chegou no WhatsApp do remetente com as datas de drop corretas
(D5 → 21/09/2026, D10 → 26/09/2026, D15 → 01/10/2026 — cálculo de +5/+10/+15
dias corridos a partir da data de coleta, conferido manualmente). Confirma
que a recaída do Bug 4 no `HTTP Request2` está resolvida.

**Validação end-to-end — coleta_navio (16/09/2026):** mensagem de teste
(`Coleta navio O.SKY tanques 1C,2P,2S,3P,3S data 16/09/2026`) processada com
sucesso após corrigir o Bug 7 (workflow não salvo): 5 linhas gravadas em
COLETAS_NAVIO (uma por tanque, IDs únicos `CN-<timestamp>-<índice>`), 15
linhas gravadas em DROPS (5 tanques × 3 drops, `Tipo Tanque: Navio`,
`Navio: O.SKY`, datas D5/D10/D15 corretas), e confirmação recebida no
WhatsApp com a lista de tanques e total. Branch `coleta_navio` considerado
completo.

**Validação end-to-end — consulta_drops (16/09/2026):** após corrigir os
Bugs 8 e 9, mensagem de teste `drops hoje` retornou corretamente os drops
pendentes daquele dia, combinando terra e navio na mesma linha quando
aplicável:
```
D5 -  Tanques 1C,2P,2S,3P,3S  NAVIO O.SKY - coletados 11/09/2026
D10 -  Tanques 42 - coletados 06/09/2026
D15 -  Tanques 3S  NAVIO O.SKY - coletados 01/09/2026
```
Confirma que o agrupamento por `Dia Drop`, a separação terra/navio, e o
cálculo retroativo da data de coleta (hoje − N dias) funcionam corretamente
sem precisar de join entre DROPS e COLETAS_NAVIO. Branch `consulta_drops`
considerado completo — fase "coleta + drops" do roadmap do LabFlow
encerrada.

**Validação end-to-end — formato inválido em coleta_terra e coleta_navio
(17/09/2026):** após adicionar o `If` de validação nos dois branches (ver
"Melhorias adicionais implementadas"), testado o caminho de erro de cada
um:
- `registrar coleta tanque terra` (sem número nem data) →
  `"❌ Não foi possível registrar a coleta de terra. Formato esperado:
  'registrar coleta tanque terra <número> data <dd/mm/aaaa>'"`
- `coleta navio tanques data 16/09/2026` (sem nome do navio) →
  `"❌ Não foi possível registrar a coleta de navio. Formato esperado:
  'Coleta navio <nome> tanques <lista separada por vírgula> data
  <dd/mm/aaaa>'"`

Ambas as respostas bateram exatamente com o esperado, confirmando que a
validação de formato está funcionando nos dois branches de coleta — mesmo
nível de tratamento de erro que o branch `amostra` já tinha.

**Validação end-to-end — rastreio de arquivo/descarte, bags e potes
(17/09/2026):** testados os quatro caminhos do recurso novo:
- `registrar coleta tanque terra 99 data 17/09/2026` → linha gravada em
  `BAGS_TERRA` com `Data Descarte Prevista: 17/09/2027` (coleta + 365 dias).
- `coleta navio o.test tanques 1C,2P data 17/09/2026` → 2 linhas gravadas em
  `POTES_NAVIO` (uma por tanque), `Data Descarte Prevista: 17/09/2027`.
- `quais bags posso descartar hoje` (sem nenhuma bag vencendo) →
  `"♻️ Nenhuma bag de terra pra descartar hoje (17/09/2026)."`; depois de
  registrar `registrar coleta tanque terra 77 data 17/09/2025` (coleta de 1
  ano atrás, descarte cai exatamente hoje), a mesma pergunta retornou
  `"♻️ Bags de terra pra descartar hoje (17/09/2026):\nTanque 77 - coletado
  17/09/2025\nTotal: 1 bag(s)"`.
- `quais potes navio posso descartar hoje` (sem nenhum pote vencendo) →
  `"♻️ Nenhum pote de navio pra descartar hoje (17/09/2026)."`; depois de
  `coleta navio o.retest tanques 1C data 17/09/2025`, a mesma pergunta
  retornou `"♻️ Potes de navio pra descartar hoje (17/09/2026):\nTanque 1C
  (o.retest) - coletado 17/09/2025\nTotal: 1 pote(s)"`.

Os quatro caminhos (gravação terra, gravação navio, consulta bags vazia +
com item, consulta potes vazia + com item) bateram exatamente com o
esperado. Feature de rastreio de arquivo/descarte considerada completa.

---

## Lição aprendida — painel de consulta no Google Sheets (17/09/2026)

Fora do n8n, ao montar uma aba `Painel` (fora das abas de dados, só com
fórmulas lendo `DROPS`) pra visualizar os drops pendentes do dia, dois
problemas de fórmula do Google Sheets (não bugs do fluxo n8n/Code node):

**1. `QUERY` infere o tipo de cada coluna pela maioria dos valores.** A
coluna `TANQUE` da aba DROPS mistura número (tanques de terra: 40, 42...) e
texto (tanques de navio: "1C", "2P"...). Como a maioria das linhas é de
terra, o `QUERY` decide que a coluna é numérica e descarta silenciosamente
os valores de texto (viram vazio no resultado) — os tanques de navio
somem do painel, mesmo estando certos na aba DROPS. **Fix:** trocar
`QUERY` por `FILTER`, que não infere tipo de coluna, só filtra e devolve o
valor da célula como está.

**2. Separador de array dentro de `{ }` depende do idioma da planilha.**
No Google Sheets em português, `;` dentro de `{ }` significa "nova linha"
(empilha os ranges verticalmente), e `\` significa "nova coluna" (coloca
lado a lado) — o oposto do que se costuma ver em tutoriais em inglês (onde
`,` é coluna). Usar `;` pra tentar juntar colunas gera erro de "tamanhos de
intervalo não correspondentes" (o array fica N vezes mais alto que o
esperado, N = número de colunas que deveriam estar lado a lado).

**Fórmula final que funcionou** (colada em `A2` da aba Painel, com
cabeçalho `ID | Tipo | Tanque | Navio | Dia Drop` digitado manualmente na
linha 1):
```
=FILTER({DROPS!A2:A\DROPS!C2:C\DROPS!D2:D\DROPS!E2:E\DROPS!F2:F}; DROPS!G2:G=TODAY(); DROPS!H2:H="Pendente")
```

## Novo recurso: gerenciamento de usuários/permissões via WhatsApp (17/09/2026)

**Motivação:** comando `adicionar cargo <nivel> para o numero <numero>` (só
Admin) precisa **escrever** na lista de usuários em tempo real. Uma lista
hardcoded dentro do Code node não serve — código de workflow não se
auto-edita em runtime. Decisão: mover a lista de usuários pra uma aba nova
`USUARIOS` (`Numero | Nome | Nivel`) no Google Sheets, fonte da verdade,
substituindo a lista hardcoded cogitada inicialmente.

**Mudanças na arquitetura:**

1. Novo node **`Get rows USUARIOS`** inserido entre `Filter` e
   `Code in JavaScript` (lê a aba inteira, sem filtro).
2. `Code in JavaScript` passa a rodar em **"Run Once for All Items"**
   (antes processava um item de webhook por vez; agora o input principal
   passa a ser as linhas de `USUARIOS`, então os guards de `fromMe`/
   timestamp e o parsing do texto usam `$('Webhook').first().json`
   diretamente em vez do item de entrada implícito).
3. Nova intenção `gerenciar_usuario`: regex
   `/(adicionar|trocar|mudar)\s+cargo\s+(de\s+)?(\w+)\s+para\s+o?\s*n[uú]mero\s+(\d+)/i`.
   Só executa se o remetente (`numeroRemetente`, comparado contra a lista de
   `USUARIOS` carregada) tiver `Nivel === 'Admin'`; caso contrário retorna
   erro de permissão sem tocar a planilha.
4. Gravação via node **"Append or Update Row"** (upsert nativo do n8n
   Google Sheets node, matching column = `Numero`) — dispensa checar
   manualmente se o número já existe: se existir, atualiza `Nivel`; se não,
   cria a linha. Evita ter que reimplementar upsert na mão com Update Row +
   Append Row condicionais.
5. Novo branch no `Switch`: `gerenciar_usuario` → `If` (`nivelAtual ===
   'Admin'`) → `true`: Append or Update Row in USUARIOS → Edit Fields
   (confirmação) → HTTP Request (reply) → Respond to Webhook; `false`:
   Edit Fields (erro de permissão) → HTTP Request → Respond to Webhook.

**Status:** implementado e validado (18/09/2026) — ver bug encontrado e
validação end-to-end abaixo.

---

## Bug 10 — `$json` apontando pro node errado depois de inserir um node no meio da cadeia

**Sintoma:** ao testar `adicionar cargo Operador para o numero <próprio
número>` como Admin, a resposta no WhatsApp veio como "não autorizado"
mesmo enviando de um número que era Admin — só que, ao conferir a
planilha, o cargo **tinha sido alterado** mesmo assim. Comportamento
aparentemente contraditório.

**Causa raiz (em duas camadas):**
1. O node `HTTP Request (cargo - sucesso)` (ramo `true` do `If autorizado`,
   depois do `Append or Update USUARIOS`) usava `{{ $json.textoResposta }}`
   no campo `text`. `$json` sempre se refere ao node **imediatamente
   anterior** na cadeia — que agora era o `Append or Update USUARIOS`
   (Google Sheets), não mais o `Code in JavaScript`. O Google Sheets, após
   gravar, devolve os dados da linha gravada (`Numero`, `Nome`, `Nivel`),
   sem o campo `textoResposta` — que só existe no output do Code node. Isso
   fazia a Evolution API recusar a chamada com `400 Bad Request — "Text is
   required"`, e a execução terminava com **Error** sem responder o
   webhook.
2. Como a execução não respondia a tempo, a Evolution API **reenviava a
   mesma mensagem** (retry por timeout), gerando uma **segunda execução**
   poucos segundos depois. Essa segunda execução lia a planilha já
   alterada pela primeira (que tinha conseguido gravar antes de falhar no
   `HTTP Request`) e, corretamente, negava — porque nesse ponto o cargo já
   não era mais Admin. Foi essa segunda resposta (a de negação) que
   apareceu no WhatsApp, escondendo o sucesso da primeira gravação.

**Solução aplicada:** trocar `{{ $json.textoResposta }}` por
`{{ $('Code in JavaScript').item.json.textoResposta }}` no `HTTP Request`
do ramo `true` — mesma referência explícita por nome de node já usada no
campo `number` (lição do Bug 4).

**Lição:** `$json` não é "o dado lá de trás que eu quero", é sempre "o
node ligado direto antes". Todo `HTTP Request` de resposta é uma
"borda" do fluxo, então **nunca** confiar em `$json` nele — sempre
referenciar o node de origem dos dados por nome
(`$('Code in JavaScript').item.json...`), especialmente depois de inserir
um node no meio de uma cadeia que já funcionava (nesse caso, o
`Append or Update USUARIOS`). Além disso: uma execução que termina em
**Error** pode já ter causado efeitos colaterais reais (gravação em
planilha) antes de falhar — "erro" não significa "nada aconteceu", e pode
disparar reenvio automático do webhook pela Evolution API, causando uma
segunda execução sobre um estado já alterado pela primeira.

**Validação end-to-end — gerenciar_usuario (18/09/2026):** após a
correção, todos os cenários testados via WhatsApp:
- Admin altera o próprio cargo ou o de outro número → `✅ Cargo
  atualizado...`, planilha reflete a mudança
- Cargo repetido/atualização de número já existente (upsert) → mesma
  linha atualizada, sem duplicar
- Cargo inválido (`Estagiario`) → `❌ Cargo inválido. Use: Admin ou
  Operador.`, planilha inalterada
- Usuário `Operador` tentando alterar cargo (inclusive o próprio, tentando
  se autopromover a Admin) → `❌ Só administradores podem alterar cargos
  de usuários.`, planilha inalterada
- Regressão dos branches antigos (`coleta_navio`, `amostra`,
  `consulta_drops`) após a troca do Code node pra "Run Once for All
  Items" → todos continuaram funcionando normalmente

**Extensões pós-validação (18/09/2026):**
- Comando `gerenciar_usuario` passou a aceitar `nome <nome>` opcional no
  final (regex com grupo opcional), pra preencher a coluna `Nome` ao
  cadastrar alguém que ainda não mandou mensagem nenhuma; se omitido,
  mantém o nome já existente daquele número (evita apagar sem querer).
  Quando o Admin mexe no próprio cadastro, o nome é puxado automático do
  `pushName` do WhatsApp, sem precisar digitar.
- **Sincronização automática de nome**: adicionado um caminho paralelo no
  fluxo — saída do `Code in JavaScript` também vai (além do `Switch`
  normal) pra um `If sincronizarNome` → `Sincronizar Nome USUARIOS`
  (Append or Update Row, só grava `Numero`/`Nome`, sem tocar em `Nivel`).
  Dispara toda vez que alguém **já cadastrado** manda qualquer mensagem
  (não só o comando de cargo) e o `pushName` atual difere do `Nome` salvo
  — mantém a coluna `Nome` sempre atualizada sem esforço manual, sem criar
  cadastro novo pra quem não é usuário. Importante: esse caminho roda **em
  paralelo** ao `Switch` (dois fios saindo do mesmo ponto do `Code
  in JavaScript`), não em série — encaixar um node de escrita Sheets no
  meio do caminho principal reproduziria o Bug 10 (perderia os campos que
  o `Switch` precisa pra rotear).
- Refatoração interna do Code node: toda resposta passou a sair por uma
  função auxiliar `output(json)`, que anexa automaticamente os campos de
  controle da sincronização de nome (`_sincronizarNome`,
  `_numeroRemetenteLimpo`, `_nomeContatoAtual`) em qualquer branch, sem
  precisar repetir esses três campos em cada `return` manualmente.

Validado: nome apagado manualmente na planilha volta a ser preenchido
sozinho após qualquer mensagem comum (testado com `drops hoje`), sem
regressão no roteamento do `Switch`.

Feature de gerenciamento de usuários/permissões via WhatsApp (cargo +
nome, com sincronização automática) considerada completa.

---

## Bug 11 — Webhook configurado pela tela do Manager não era salvo (deploy no VPS)

**Data:** 21/09/2026, durante a migração da stack para o VPS.

**Sintoma:** depois de migrar a instância `labflow2` para o Evolution API
rodando no servidor e configurar a URL e os eventos do webhook pela tela
do **Manager**, mensagens reais enviadas ao número pareado não geravam
nenhuma execução no n8n (aba **Executions** ficava vazia, mesmo com o
workflow ativo).

**Diagnóstico:** um teste manual de conectividade, chamando a URL do
webhook de dentro do próprio container do Evolution, retornou `200 OK`:

```bash
docker exec labflow-evolution wget -S -O- --post-data='{}' \
  --header='Content-Type: application/json' \
  http://labflow-n8n:5678/webhook/<caminho> 2>&1
```

Isso confirmou que a rede Docker e o n8n estavam corretos — o problema era
o Evolution **nunca chamar** essa URL quando uma mensagem chegava de
verdade. Consultando a configuração da instância diretamente pela API:

```bash
curl -s http://127.0.0.1:8080/webhook/find/labflow2 -H "apikey: $API_KEY"
```

O retorno foi `null` — ou seja, a configuração feita pela tela do Manager
nunca chegou a ser persistida de fato, mesmo a interface não acusando erro
nenhum no momento de salvar.

**Solução aplicada:** configurar o webhook diretamente via API, em vez de
pela tela:

```bash
curl -X POST http://127.0.0.1:8080/webhook/set/labflow2 \
  -H "Content-Type: application/json" \
  -H "apikey: $API_KEY" \
  -d '{
    "webhook": {
      "url": "http://labflow-n8n:5678/webhook/<caminho>",
      "enabled": true,
      "webhookByEvents": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

Depois dessa chamada, o `GET /webhook/find/labflow2` passou a retornar a
configuração completa (em vez de `null`), e a mensagem de teste seguinte
gerou a primeira execução bem-sucedida no n8n do servidor.

**Nota lateral — falso teste com corpo vazio:** o próprio teste de
conectividade (`wget --post-data='{}'`) gerou uma execução no n8n, mas ela
foi descartada pelo node **Filter**, por não ter os campos
`data.key.fromMe` nem `data.message.conversation` — o corpo do teste
estava vazio, sem simular uma mensagem real. Esse descarte é o
comportamento **correto** do Filter, e não deve ser confundido com falha
de configuração: o teste provou conectividade de rede, não validou a
lógica do workflow. A confirmação definitiva só veio com uma mensagem de
WhatsApp real, de um número diferente do pareado.

**Lição:** ao suspeitar de uma configuração "fantasma" (a interface não
mostra erro, mas o comportamento não muda), consultar o estado real pela
API é mais confiável do que confiar na tela — e permite reconfigurar de
forma determinística e reaproveitável em scripts, em vez de tentar de novo
pela UI esperando um resultado diferente.

---

## Bug 12 — "Hoje" calculado no fuso UTC do container

**Sintoma:** à noite, as consultas do dia (`drops hoje`, bags, potes,
análises) passavam a responder como se já fosse o dia seguinte.

**Causa raiz:** os Code nodes calculavam a data de hoje com
`new Date().getDate()` ou `toLocaleDateString('pt-BR')` sem informar o
fuso. No servidor, o container do n8n usa o relógio em UTC. A variável
`TZ=America/Sao_Paulo` do `docker-compose` não tem efeito nesse cálculo
em JavaScript sem o pacote `tzdata` na imagem. Resultado: a partir das
21h de Brasília (meia-noite UTC), "hoje" virava amanhã.

**Solução aplicada:** informar o fuso explicitamente em todo Code node
que calcula a data de hoje (`consulta_drops`, `consulta_bags`,
`consulta_potes`, `Code Analises Terra`, `Code Analises Navio`):

```javascript
const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
```

**Lição:** o bug não aparecia no Docker local, só no servidor, e só em
um horário específico. Qualquer cálculo de data que depende de "agora"
deve informar o fuso explicitamente, sem depender da configuração do
ambiente.

---

## Bug 13 — Aba USUARIOS vazia faz o bot parar de responder para todos

**Sintoma:** durante os testes de permissão, a própria linha de cadastro
foi apagada da aba `USUARIOS`, deixando a aba sem nenhuma linha. A partir
daí, nenhuma mensagem de nenhum número gerava resposta.

**Causa raiz:** o `Code in JavaScript` principal roda em modo "Run Once
for All Items" e recebe como entrada as linhas da `USUARIOS` (o payload
do webhook é lido via `$('Webhook').first().json`). Com a aba vazia, o
`Get rows USUARIOS` não repassa nenhum item, e o Code node simplesmente
não executa.

**Solução aplicada:** recadastrar o número como Admin direto na planilha.

**Lição:** num node "Run Once for All Items", zero itens de entrada
significa zero execuções, sem erro. A aba `USUARIOS` precisa ter pelo
menos um Admin cadastrado para o bot funcionar. Mesma categoria do
Bug 14.

---

## Bug 14 — `Get rows` de aba vazia interrompe a execução em silêncio

**Sintoma:** no primeiro teste do bloqueio de coleta duplicada de navio,
a execução parava no `Get rows COLETAS_NAVIO`, sem erro e sem resposta
no WhatsApp.

**Causa raiz:** a aba `COLETAS_NAVIO` estava vazia. Por padrão, um
`Get rows` que não encontra linhas não repassa nenhum item, então o
`Checar Duplicata Navio` seguinte nunca executava.

**Solução aplicada:** ativar **Always Output Data** nas configurações do
`Get rows COLETAS_NAVIO` e, como prevenção, do `Get rows COLETAS_TERRA`.
Com isso, o node repassa um item vazio e o fluxo segue normalmente (sem
duplicata encontrada).

**Lição:** todo `Get rows` usado para checagem (duplicata, permissão)
precisa funcionar com a aba vazia, que é justamente o estado inicial de
qualquer planilha nova.

---

## Bug 15 — Conexões erradas ao religar o fluxo manualmente (bloqueio de duplicata)

**Contexto:** para o bloqueio de coleta duplicada, foi preciso inserir
`Get rows` + checagem + `If Duplicado` no meio dos branches de coleta, o
que exigiu religar várias conexões à mão no editor do n8n.

**Como foi encontrado:** o workflow foi exportado em JSON e revisado fora
do n8n. A revisão das conexões encontrou quatro problemas:

1. O `Split Out` de drops da `coleta_terra` ficou sem conexão de entrada:
   as coletas eram gravadas, mas os drops D5/D10/D15 não.
2. O ramo de erro do `If` de validação de amostra ganhou conexões para
   `Split Out Coleta Terra` e `Split Out1` (do `coleta_navio`), nodes que
   não têm nada a ver com esse branch.
3. O `If Duplicado Terra` ligava só 2 dos 4 destinos no caminho "não
   duplicado" (faltavam o `Split Out` de drops e o `Split Out Coleta
   Terra`).
4. `HTTP Duplicado Terra`, `HTTP Request Analises Terra` e `HTTP Request
   Analises Navio` não tinham `Respond to Webhook` depois, deixando a
   execução pendurada até dar timeout.

**Solução aplicada:** todas as conexões corrigidas no JSON e o workflow
reimportado. O workflow também foi reorganizado visualmente, com uma
fileira por branch. Um segundo export, depois do bloqueio de duplicata
para navio, foi revisado do mesmo jeito e não tinha erros.

**Lição:** religar conexões à mão num fluxo grande quebra coisas que não
aparecem no teste do caminho principal. Exportar o JSON e revisar as
conexões virou etapa fixa depois de qualquer mudança estrutural. E todo
caminho que termina em `HTTP Request` precisa de um `Respond to Webhook`
no final.

---

## Configuração da instância Evolution API (recomendada)

```json
{
  "rejectCall": false,
  "msgCall": "",
  "groupsIgnore": false,
  "alwaysOnline": false,
  "readMessages": false,
  "readStatus": false,
  "syncFullHistory": false
}
```
