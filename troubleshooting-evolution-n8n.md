# Troubleshooting: Integração WhatsApp (Evolution API) + n8n

**Projeto:** LabFlow — automação de registro de amostras via WhatsApp
**Data:** Setembro/2026
**Componentes:** Evolution API v2 (self-hosted, Docker) + Postgres + n8n (self-hosted, Docker)

Este documento registra os bugs enfrentados durante a integração do WhatsApp
Business (via Evolution API) com o fluxo de automação no n8n, a causa raiz de
cada um e a solução aplicada. Serve como referência técnica e como registro
do processo de debug para o portfólio do projeto.

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

---

## Arquitetura final do fluxo (n8n)

O fluxo trata quatro tipos de mensagem (`amostra`, `coleta_terra`,
`coleta_navio` e `consulta_drops`), roteados por um node **Switch**, cada
um com seu próprio trio de resposta (Edit Fields/campo pronto → HTTP
Request → Respond to Webhook) independente:

```
Webhook (Evolution API)
  → Filter (fromMe = false AND message.conversation exists)
  → Code in JavaScript (guards de fromMe/timestamp + parsing regex + ID + nome
                         + função calcularDrops(dataColeta, idColeta, tanque,
                           tipoTanque, navio) reaproveitada pelos dois branches
                           de coleta)
  → Switch (mode: Rules)
       ├─ amostra        → If (validação dos campos extraídos)
       │                     ├─ true  → Append Row in sheet → Edit Fields1 (texto de sucesso)
       │                     │           → HTTP Request1 (reply, number = numero do Code node)
       │                     │           → Respond to Webhook
       │                     └─ false → Edit Fields (texto de erro) → HTTP Request (reply de erro)
       │                                 → Respond to Webhook1
       ├─ coleta_terra   → Append Row in sheet1 (COLETAS)
       │                  → Split Out (campo drops) → Append Row in sheet2 (DROPS)
       │                  → Resposta (Edit Fields) → HTTP Request2 (reply, number = numero do Code node)
       │                    → Respond to Webhook2
       ├─ coleta_navio   → Split Out (campo itensColeta) → Append Row in sheet4 (COLETAS_NAVIO)
       │                  → Split Out2 (campo drops) → Append Row in sheet3 (DROPS, mesma aba da terra)
       │                  → HTTP Request (reply direto, number = numero do Code node,
       │                    text = {{ $json.textoResposta }}) → Respond to Webhook (novo)
       └─ consulta_drops → Get rows DROPS (sem filtro, lê a aba inteira)
                          → Code "Montar resposta drops" (Run Once for All Items;
                            filtra Data Prevista = hoje, agrupa por Dia Drop,
                            separa terra/navio pelas colunas Tipo Tanque/Navio)
                          → HTTP Request (reply, text = {{ $json.textoResposta }})
                            → Respond to Webhook
```

**Notas:**
- Ao contrário do branch `amostra`, os branches `coleta_terra` e
  `coleta_navio` não têm um `If` de validação antes de responder — qualquer
  mensagem desses tipos cai direto na resposta, sem tratamento de erro
  dedicado. Não é um bug, mas é uma assimetria a considerar se algum dia
  precisar de validação de campos.
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
