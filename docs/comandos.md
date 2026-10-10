# Comandos do LabFlow

Lista dos comandos reconhecidos pelo bot do WhatsApp, com o formato esperado e um exemplo de cada. O reconhecimento é feito por expressões regulares num nó de código do n8n, a partir do texto da mensagem recebida.

## Regras gerais

- **Mensagens do próprio número pareado são ignoradas.** O bot não processa mensagens enviadas por ele mesmo.
- **Mensagens com mais de 10 minutos são descartadas.** Evita reprocessar mensagens antigas se o serviço ficar fora do ar por um tempo e voltar.
- **Só números cadastrados usam o bot.** Quem não está cadastrado (tabela `usuarios`) recebe uma mensagem pedindo cadastro e nenhum comando é executado.
- **Mensagem que nenhum comando reconhece vai para a IA** (seção 11), em vez de ser tratada como amostra.
- Os comandos abaixo não diferenciam maiúsculas de minúsculas.

## Cargos e permissões

| Cargo | Registrar (coleta, análise, concluir drops e leituras) | Consultar | Gerenciar cargos |
|---|---|---|---|
| **Admin** | ✅ | ✅ | ✅ |
| **Operador** | ✅ | ✅ | ❌ |
| **Consultor** | ❌ | ✅ | ❌ |

## 1. Registrar coleta de terra

```
registrar coleta tanque terra <número ou lista separada por vírgula> data <dd/mm/aaaa>
```

**Exemplos:**
```
registrar coleta tanque terra 42 data 20/09/2026
registrar coleta tanque terra 42,43,44 data 20/09/2026
```

Aceita de 1 a 8 tanques por mensagem; com 9 ou mais, a mensagem é recusada sem gravar nada. Para cada tanque, gera um ID de coleta, calcula as três datas de drop (D5, D10, D15) e a data de arquivamento do bag (365 dias depois da coleta).

Se algum tanque da lista já tiver coleta registrada na mesma data, a mensagem inteira é recusada e a resposta informa quem já registrou.

**Resposta:**
```
✅ Registro de tanque terra efetuado com sucesso por <nome de quem enviou>.

Tanques: 42, 43
Data: 20/09/2026
Total: 2 tanques
```

## 2. Registrar coleta de navio

```
Coleta navio <nome do navio> tanques <lista separada por vírgula> data <dd/mm/aaaa>
```

**Exemplo:**
```
Coleta navio O.SKY 123 tanques 1C,2P,2S,3S data 20/09/2026
```

Aceita de 1 a 16 tanques. O nome do navio pode incluir o número da viagem (`O.SKY 123`), sem escrever a palavra "viagem". Repete o cálculo de drops e arquivamento do pote para cada tanque informado.

Mesma regra de duplicata da coleta de terra, considerando também o navio: o mesmo tanque em navios diferentes não é bloqueado.

A resposta segue o mesmo modelo da coleta de terra (`Registro de tanque navio efetuado com sucesso por <nome>`), com uma linha a mais para o navio.

## 3. Consultar drops previstos para hoje

Qualquer uma destas variações funciona:
```
drops hoje
drop hoje
drops previstos hoje
drops previstos para hoje
drops para hoje
```

O `?` no final é opcional (`drops hoje?` também funciona).

## 4. Consultar bags para descarte (terra)

```
quais bags descartar hoje
quais bags posso descartar hoje
quais bags de terra posso descartar hoje
bags para descartar hoje
descartar bags hoje
bags de terra hoje
```

## 5. Consultar potes para descarte (navio)

```
quais potes navio descartar hoje
quais potes do navio posso descartar hoje
quais potes posso descartar hoje
potes de navio para descartar hoje
descartar potes hoje
potes do navio hoje
```

Bags (terra) e potes (navio) são comandos separados: cada um responde só com o seu tipo.

## 6. Gerenciar cargo de usuário

Restrito a usuários com nível **Admin**.

```
adicionar cargo de <cargo> para o número <número> nome <nome>
trocar cargo de <cargo> para número <número>
mudar cargo <cargo> para o número <número> nome <nome>
```

**Exemplo:**
```
adicionar cargo de Operador para o número 5511999999999 nome João
```

Os cargos válidos são **Admin**, **Operador** ou **Consultor**. O nome é opcional; se omitido, o sistema tenta usar o nome já cadastrado (ou o nome de contato do WhatsApp, se o alvo for quem está enviando a mensagem).

Também funciona por frase livre (seção 11), por exemplo `muda o cargo do 11 99999-1234 para operador`. Nesse caso o bot mostra o comando entendido e só executa depois do "sim". O cargo precisa estar escrito na mensagem como Admin (ou administrador), Operador ou Consultor. Uma palavra parecida, como "gerente", é recusada com `Cargo inválido`.

## 7. Registrar análise de tanque

```
Analise do normal do(s) tanque(s) <lista> [navio <nome>], data <dd/mm/aaaa>
Analise do stress do(s) tanque(s) <lista> [navio <nome>], data <dd/mm/aaaa>
```

**Exemplos:**
```
Analise do normal do tanque 47, data 22/09/2026
Analise do stress dos tanques 47,49 navio O.SKY 123, data 22/09/2026
```

Aceita "do"/"dos", singular/plural e a palavra `terra` opcional (`tanque terra 40` grava o tanque como `40`). Limite de 8 tanques para terra e 16 para navio. A palavra `navio` é obrigatória nas análises de navio, porque é ela que diferencia terra de navio na regex. Por frase livre (seção 11), a IA entende variações como `fiz a análise normal dos tanques 44 e 45 hoje` e monta o comando padrão.

A confirmação mostra a data da leitura final do CT (`Data final CT`) e da pré-leitura do BL.

**A análise exige coleta.** Cada tanque é ligado à coleta mais recente com data até a data da análise (e do mesmo navio, no caso de navio). Se algum tanque da lista não tiver coleta, nada é gravado e o bot responde:

```
❌ Análise não registrada: não há coleta de terra até 22/09/2026 para o(s) tanque(s) 47.

Registre a coleta primeiro. Nada foi gravado.
```

Cada tanque gera 4 linhas na tabela `analises`:

| Sub-análise | Método | Pré-leitura | Leitura final |
|---|---|---|---|
| CT (Contagem Total) | Profundidade | — | 48h |
| BL (Bolores e Leveduras) | Profundidade | 72h | 120h |
| WORT (Psicrotróficos) | Profundidade | 120h | 240h |
| WORT (Psicrotróficos) | Superfície | 120h | 240h |

## 8. Consultar análises do dia

```
Quais analises de tanques terra saem hoje?
Quais analises de tanques navio saem hoje?
```

A resposta agrupa por sub-análise + prazo (em horas) + frasco, juntando WORT Profundidade e Superfície numa linha só:

```
CT (48hrs) Tanques 47 e 49 analise normal
BL (72hrs) Tanques 37 e 40 analise normal
Psicrotroficos (240hrs) do(s) Tanques 42 e 41 analise Stress
```

Leituras já concluídas continuam aparecendo, marcadas com ✅, e o fim da resposta mostra o total (ex: `✅ = lido (2 de 5)`). No WORT, o tanque só ganha ✅ quando Profundidade e Superfície estão lidas.

## 8.1 Relatório do dia (tanques)

```
relatório do dia tanques terra
relatório do dia tanques navio
relatório do dia
```

Monta o que sai hoje no formato do relatório diário de microbiologia: uma linha para cada leitura (C.T 48h, B.L 72h, B.L 120h, Psicrotróficos 120h e 240h) em amostra normal e stress, mais os drops. Toda linha aparece, com `-` quando não há nada. Os dados vêm da view `vw_relatorio_nfc` (`db/migrations/003_relatorio_nfc.sql`).

```
📋 Relatório do dia 05/10/2026

NFC — Tank farm

AMOSTRA NORMAL
C.T 48h: 45 ✅
B.L 72h: -
B.L 120h: 44
Psicrotróficos 120h: 44
Psicrotróficos 240h: -
...
DROPS
Drop 5: 42, 43, 44, 46 ✅, 47
Drop 10: 46
Drop 15: -
TAB: -

✅ = lido (2 de 9)
```

No navio, os tanques vêm agrupados por navio, como na planilha: `O.SUN 156 (1A ✅, 1F); O.SKY 133 (2P)`. `relatório do dia` sozinho agora traz **todos os blocos**, inclusive o concentrado, e a linha TAB do tank farm mostra os TABs de NFC por tanque: ver a seção 15.

## 9. Concluir drops do dia

```
Concluir drops [D5|D10|D15] terra
Concluir drops [D5|D10|D15] navio [<nome do navio>]
```

**Exemplos:**
```
Concluir drops D5 terra
Concluir drops terra
Concluir drops D10 navio O.SKY 123
Concluir drops navio
```

Marca como `Concluído` todos os drops da tabela `drops` com status `Pendente` e data prevista hoje que batem no filtro. O dia (D5/D10/D15) e o nome do navio são opcionais. Sem eles, conclui todos os estágios e todos os navios. A resposta lista os tanques e as datas de coleta concluídos.

## 10. Concluir leituras de análise (CT/BL/WORT)

```
Concluir [pre|final] leitura [CT|BL|WORT] [normal|stress] terra
Concluir [pre|final] leitura [CT|BL|WORT] [normal|stress] navio [<nome do navio>]
```

**Exemplos:**
```
Concluir final leitura CT normal terra
Concluir pre leitura BL stress navio O.SKY 123
Concluir leitura terra
```

Estágio, sub-análise, frasco e nome do navio são opcionais. Sem eles, o comando pega todas as leituras que vencem hoje para terra (ou navio).

O comando funciona em duas etapas:

1. O bot **não altera nada ainda**. Ele lista as leituras encontradas e pergunta se pode concluir. A pendência fica guardada na tabela `confirmacoes` (uma por usuário; uma nova substitui a anterior).
2. O analista responde com uma mensagem só com **`sim`** (confirma) ou **`não`**/**`nao`** (cancela). A pendência expira em **10 minutos**; depois disso é preciso mandar o comando de novo. Se a data da pendência não puder ser lida, ela também é tratada como expirada (é mais seguro recusar do que confirmar sem saber a idade).

Ao confirmar, cada linha muda de status na tabela `analises`:

| Status atual | Data que precisa ser hoje | Novo status |
|---|---|---|
| Aguardando Pré-Leitura | Data Pre-Leitura | Aguardando Leitura Final |
| Aguardando Leitura Final | Data Leitura Final | Concluído |

O nome de quem confirmou fica registrado na coluna `pre_leitura_por` ou `leitura_final_por`, conforme o estágio concluído.

**Exemplo de conversa:**
```
Você:     Concluir final leitura CT normal terra
LabFlow:  ❓ Tem certeza que quer concluir as seguintes leituras?

          Leitura de CT do tanque 47, data 23/09/2026
          Leitura de CT do tanque 49, data 23/09/2026

          Responda "sim" para confirmar ou "não" para cancelar.
Você:     sim
LabFlow:  ✅ Concluído:

          Leitura de CT do tanque 47, data 23/09/2026
          Leitura de CT do tanque 49, data 23/09/2026

          Leitura feita por: João
```

A consulta "Quais analises ... saem hoje?" continua mostrando as leituras já concluídas no dia, de propósito: a lista do dia serve de base para o resumo enviado por e-mail.

## 11. Mensagem livre (IA)

Quando a mensagem não bate em nenhum comando acima, ela é enviada ao Gemini, que tenta transformá-la num comando do formato padrão. A IA entende:

| Tipo | Exemplo de mensagem | Comando montado | Confirmação |
|---|---|---|---|
| Coleta de terra | `coletei os tanques 60 e 61 hoje` | `registrar coleta tanque terra 60,61 data 29/09/2026` | "sim" |
| Coleta de navio | `coletei 1C e 4P do O.SKY 123 hoje` | `Coleta navio O.SKY 123 tanques 1C,4P data 29/09/2026` | "sim" |
| Registro de análise | `fiz a análise normal dos tanques 44 e 45 hoje` | `Analise normal tanques 44,45 data 29/09/2026` | "sim" |
| Concluir drops | `fiz os drops D5 de terra` | `Concluir drops D5 terra` | "sim" |
| Troca de cargo | `muda o cargo do 11 99999-1234 para operador` | `trocar cargo de Operador para o número 5511999991234` | "sim" |
| Concluir leitura | `li o CT final normal de terra` | `Concluir final leitura CT normal terra` | o fluxo da seção 10 |
| Consultas | `quais drops tenho hoje?` | `drops para hoje` | nenhuma (só lê) |
| **Todos os comandos novos** (concentrado, TAB, Coliformes, Howard, C.T/B.L, relatório, leitura do dia, desvio) | `chegaram os lotes 1 a 14 do load 77001 item 444 da fábrica AQA` · `apareceu colônia no TAB 11` · `relatório diário` · `terminei a leitura de hoje` · `o drop D5 do tanque 45 da coleta de 30/09/2026 deu ruim` | o formato oficial do comando (seções 12.1 a 15.2) | consulta: nenhuma; gravação direta (recebimento, compostas, embarque, TAB/Coliformes feito, TAB em confirmação): "sim" da IA; comando que já pergunta (Howard, C.T/B.L, etapas do dia, resultados, finalizada, desvio): o "sim" do próprio comando |

A IA nunca grava nada sozinha. Nas gravações, o bot responde com o comando que entendeu e pede confirmação:

```
Você:     coletei os tanques 42 e 43 hoje
LabFlow:  🤖 Entendi:
          registrar coleta tanque terra 42,43 data 29/09/2026

          Responda sim para confirmar ou não para cancelar.
Você:     sim
LabFlow:  ✅ Registro de tanque terra efetuado com sucesso por João.

          Tanques: 42, 43
          Data: 29/09/2026
          Total: 2 tanques
```

- **`sim`** executa o comando como se ele tivesse sido digitado: mesmas permissões, mesmos limites (8 tanques em terra, 16 em navio) e mesmo bloqueio de coleta duplicada.
- **`não`**/**`nao`** cancela, e nada é gravado.
- A pendência expira em **10 minutos**, como na conclusão de leituras (seção 10).
- **Consultas** e **concluir leitura** não pedem o "sim" da IA: as consultas só leem o banco, e a conclusão de leitura já lista as leituras e pergunta se pode concluir.
- **Permissões.** O Consultor que tenta gravar por frase livre recebe a recusa na hora, sem precisar dizer "sim". Só Admin troca cargo. O cargo e o telefone da troca de cargo precisam estar escritos na mensagem; o código confere o texto original e recusa cargos que não existem.
- Se faltar dado (data da coleta, nome do navio, tanques, normal ou stress, cargo, terra ou navio), o bot responde o que faltou. Nada é gravado e nenhuma confirmação é pedida.
- Se a mensagem não tiver relação com nenhum comando (uma saudação, por exemplo), o bot responde `Comando inválido` e explica como ver a lista (seção 12).
- Se o Gemini estiver fora do ar, o bot responde `A IA está indisponível no momento` e nada é gravado. Nesse caso, use o comando no formato padrão.

### Como a IA cobre os comandos novos (05/10/2026)

Para os comandos novos, o Gemini **reescreve a frase num formato oficial** de um catálogo que está no prompt (intenção `comando`), em vez de devolver campos soltos. O node `Validar resposta da IA` confere se o resultado tem um formato conhecido e decide a classe: **consulta** (roda direto), **pede_sim** (o fluxo do comando já pergunta "sim") ou **grava** (a IA pergunta "sim" antes). Formato fora do catálogo é recusado. O comando volta ao webhook, onde a regex e as permissões rodam de novo: a IA nunca grava o que o código não aceitaria.

- Falta de dado obrigatório (ex.: item e fábrica do load, data da coleta do drop) vira a intenção `incompleto`, e o bot pergunta o que faltou. Nada é inventado.
- Números falados por extenso (pensando no áudio) viram algarismos: "load setenta e oito mil e cinco" = 78005.
- **Regressão do prompt:** depois de mudar o prompt, gerar o workflow de teste (`node scripts/gerar-teste-prompt-ia.js`, ver `scripts.md`), importar no n8n, executar e conferir o placar. Em 05/10/2026: 44 de 44 frases diferentes dos exemplos do prompt, incluindo frases em estilo de áudio e as intenções antigas.

O registro de amostra avulsa (`amostra <número> ...`) foi removido na versão 0.8.0: as amostras do laboratório serão o recebimento e o embarque de suco concentrado, que serão um módulo próprio no banco.

## 12. Ajuda por assunto

Resolvida por regex, sem chamar a IA (por isso responde na hora e funciona mesmo com o Gemini fora do ar). Vale para qualquer cargo.

```
comandos
comandos para drops
comandos de leitura
consultar análises
consultar tanques
consultar descarte
consultar cargos
consultar relatório
```

| Assunto | O que mostra |
|---|---|
| `drops` | consultar e concluir drops |
| `tanques` (ou `coletas`) | coleta de terra e de navio |
| `análises` | registrar análise e consultar o que sai hoje |
| `leituras` | concluir leituras |
| `descarte` (ou `bags`, `potes`) | consultar bags e potes |
| `cargos` (ou `gerenciar cargos`, `usuários`) | trocar cargo (somente Admin) |
| `relatório` | relatório do dia dos tanques |

`comandos` sozinho mostra o menu de assuntos. Um assunto que não existe (`comandos para xyz`) recebe o aviso e o mesmo menu. A frase `consultar drops` mostra a *lista de comandos* de drops; para ver os drops de hoje, o comando continua sendo `drops para hoje`.

## 12.1 Recebimento, compostas, TAB e Coliformes (concentrado)

Módulo de suco concentrado (FCOJ). Desenho completo em [`concentrado.md`](concentrado.md). Regras gerais: **a ordem é recebimento → compostas → testes**, o bot recusa teste de lote que não existe, e gravações que pedem "sim" expiram em 10 minutos. Só Admin e Operador gravam; o Consultor só consulta.

### Recebimento
```
recebimento load 77001 item 444 fabrica AQA lotes 1-14
recebimento load 77001 item 444 fabrica AQA lotes 1-5,7,9-10 data 01/10/2026
```
Registra os lotes do load (cada lote é uma amostra de carreta; um load recebe lotes aos poucos, em dias diferentes). Lotes repetidos são ignorados, e fábrica diferente da cadastrada para aquele load é recusada. Grava direto, sem "sim". A `data` é opcional (hoje, se omitida).

### Compostas
```
compostas do load 77001 (1-5)(6-10)(11,12,15)
```
Cria uma composta por parêntese, de 1 a N lotes em qualquer combinação (`-` é faixa, `,` separa lotes). Tudo ou nada: lote não recebido, ou já em outra composta, cancela a mensagem inteira. O bot devolve o número curto de cada composta (`#12`), usado nos comandos seguintes. `item 444` é opcional (necessário se o load existir com dois itens). TAB e Coliformes são feitos **da mesma composta**.

### TAB e Coliformes de composta
Os dois aceitam o **número `#`** ou o **formato por extenso** (load + lotes; `(1-3,5)` vale).

| TAB (caldo, +5 dias para espalhar, +5 para ler) | Coliformes (caldo, +1 dia para estriar, +1 para ler) |
|---|---|
| `tab feito das compostas #4 a #6` · `tab feito do load 77001, item 444, lotes 1-5` | `coliformes feitos das compostas #4 a #6` · `coliformes feitos do load 77001 (1-5)(6-10)` |
| `quais tabs tenho para espalhar hoje?` | `quais coliformes tenho para estriar hoje?` |
| `tabs de hoje espalhados` → sim → Incubado | `coliformes de hoje estriados` → sim → Estriado |
| `quais tabs tenho para ler hoje?` | `quais coliformes tenho para ler hoje?` |
| `tab #5 em confirmação` (PCA 24h, direto) | `coliformes #5 em confirmação` → sim: abre a composta lote a lote (`#5.6`, `#5.7`...) |
| `confirmação do tab #5 positivo` (ou `negativo`) → sim | `coliformes #5.7 positivo` → sim; a composta fecha positiva se algum lote der positivo |
| `tabs de hoje lidos` → sim: sem crescimento, todos negativos | `coliformes de hoje lidos` → sim: todos negativos |
| `quais tabs foram lidos hoje?` | `quais coliformes foram lidos hoje?` |

- `data dd/mm/aaaa` no "feito" (`tab feito das compostas #7 data 28/09/2026`) faz o prazo contar dessa data, útil para registrar retroativo.
- O que não foi feito no dia previsto continua aparecendo, com a **data prevista**: `⚠️ Atrasados — previsto 03/10/2026`.
- Por extenso: `Tab da composta load 77001, lotes 6-10, item 444, em confirmação`; `composta load 77001, lote 7 item 444, da confirmação deu positivo`.

## 13. Embarque (concentrado)

**Em teste (04/10/2026).** Desenho completo em [`concentrado.md`](concentrado.md), seção 10.1.

### Registrar o embarque
```
embarque navio O.SKY 133 linha 2 fase 2 load 77010 item 444 amostras 1-10
embarque navio O.SKY 133 linha 2 fase 2 load 77011 item 444 amostras 11-20 data 03/10/2026
```

- O navio leva a viagem junto (`O.SKY 133`). As amostras são A1, A2... e podem ser escritas com ou sem o `A` (`A1-A5` ou `1-5`, `A1-A5,A7`).
- Uma linha+fase pode ter mais de um load: um comando por load. A numeração das amostras não repete dentro da linha+fase.
- **O load não precisa existir.** Se for um load antigo, o bot o cadastra na hora (número e item, sem fábrica) e avisa. Se o recebimento for registrado depois, a fábrica é preenchida.
- Amostras já registradas são ignoradas, e a resposta diz a qual load pertencem. Se o mesmo número de load já existir com outro item, o bot avisa para conferir a digitação.
- Grava direto, sem "sim", como o recebimento. Só Admin e Operador.

### Criar compostas do embarque
```
compostas do navio O.SKY 133 linha 2 fase 2 (A1-A5)(A6-A10)
```
Todas as amostras precisam estar registradas e livres; uma composta pode juntar amostras de loads diferentes da mesma linha+fase. Nada é gravado se alguma amostra faltar ou já estiver em outra composta. O bot devolve o número de cada composta (`#21`).

### TAB e Coliformes nas compostas de embarque
Os mesmos comandos do recebimento, com o número `#` ou por extenso:
```
tab feito das compostas #21 a #22
tab feito do navio O.SKY 133 linha 2 fase 2 (A1-A5)
coliformes feitos do navio O.SKY 133 linha 2 fase 2
tab da composta navio O.SKY 133 linha 2 fase 2, amostras A1-A5, em confirmação
composta navio O.SKY 133 linha 2 fase 2, amostra A3, da confirmação deu positivo
```
As consultas (`quais tabs tenho para espalhar hoje?`, `quais coliformes tenho para ler hoje?`...) listam recebimento e embarque juntos, com a identificação `O.SKY 133 linha 2 fase 2 (A1-A5)`. Na confirmação de Coliformes, a composta de embarque é aberta **amostra por amostra** (`#21.3` = composta 21, amostra A3).
### Howard (embarque)
O Howard é **só do embarque**, feito da composta do embarque (a mesma do TAB e dos Coliformes). É uma análise de **um dia**: sem caldo, sem estria e sem confirmação, e sem prazo. Lido em 50 campos, cada campo positivo vale 2%, e o analista já manda a porcentagem.

```
howard #21 2%
Analise da composta de Howard do navio O.SKY 133 linha 2 fase 2 amostras 1-5, foi 2%
Analise da composta de Howard do navio O.SKY 133 linha 2 fase 2 (A1-A5) deu 10%
```

O bot mostra o que entendeu e só grava com **sim**:
```
❓ Gravar Howard *2%* (1 campo positivo de 50)?
#21 O.SKY 133 linha 2 fase 2 (A1-A5)

Responda *sim* ou *não*.
```

- Como são 50 campos, a porcentagem é sempre **par** (0%, 2%, 4%...); um valor ímpar ou com casas decimais, como 3% ou 2,5%, é recusado.
- Composta do recebimento é recusada ("Howard só vale para composta de embarque"). Se a composta já tem Howard, o bot avisa e o novo valor substitui o anterior.
- Só Admin e Operador registram.

Consultas:
```
temos analise de howard para hoje?
quais howards foram lidos hoje?
```
A primeira lista as compostas de embarque que ainda **não têm** Howard; a segunda, os Howards gravados hoje, com a porcentagem.
### TAB de NFC (tank farm)
O TAB também é feito **por tanque de terra**, sem composta, com o mesmo ciclo (caldo → espalhar → incubar → confirmação → resultado). O comando **sempre cita a data da coleta**, porque tanques podem acumular e o mesmo número pode ter mais de uma coleta:

```
Tab feito dos tanques terra 42,43 coleta 28/09/2026
Tab feito dos tanques terra 42,43 coleta 28/09/2026 data 30/09/2026
```

- O bot liga o TAB à coleta exata (tanque + data). Se algum tanque não tiver coleta naquela data, **nada é gravado** e a resposta diz quais. Até 8 tanques por mensagem. Só tanques de **terra** (NFC de navio não tem TAB).
- Espalhar em +5 dias e ler mais +5 dias depois de espalhar, como o TAB de composta. `data dd/mm/aaaa` é a data em que o TAB foi feito (hoje, se omitida).
- As mesmas consultas do TAB (`quais tabs tenho para espalhar hoje?`, `quais tabs tenho para ler hoje?`, `quais tabs foram lidos hoje?`) e os comandos em lote (`tabs de hoje espalhados`, `tabs de hoje lidos`) valem para os dois tipos, e as respostas listam compostas e tanques juntos (`tanque 42 (coleta 28/09/2026)`).
- Em confirmação e resultado, por tanque (não existe número `#` para tanque):
```
tab tanque terra 42 coleta 28/09/2026 em confirmação
confirmação do tab tanque terra 42 coleta 28/09/2026 positivo
```
O resultado pede "sim" antes de gravar, como no TAB de composta.
## 14. C.T e B.L por lote e por amostra (concentrado)

**Em teste (04/10/2026).** Desenho em [`concentrado.md`](concentrado.md), seção 10.2. Prazos contados da data do recebimento (lote) ou do embarque (amostra): **C.T 48h** (+2 dias), **B.L 72h** (+3) e **B.L 120h** (+5).

### Registrar os resultados
Vários grupos na mesma mensagem, separados por vírgula. Cada grupo é `lote`/`lotes` (ou `amostra`/`amostras`) + faixa ou lista + `deu` + valor:

```
ct load 77001 lote 4 deu 10, lotes 5-10 deu <10
ct load 77001 lote 4-12 deu =10, lote 13 deu 20
bl72 load 77001 lotes 1-14 deu <10
bl120 load 77001 item 444 lote 4 deu 8,5
ct navio O.SKY 133 linha 2 fase 2 amostras 1-5 deu <10, amostra 6 deu 30
```

- **Valor:** `10` ou `=10` (exato), `<10` (menor que) ou `>10` (maior que); aceita vírgula decimal. Fica gravado com a notação do laudo.
- `bl72` e `bl120` (também `bl 72`, `bl 120`) funcionam igual ao `ct`, no recebimento e no embarque. **`bl` sozinho vale `bl120`** (no registro e nas consultas, também `bls`). No embarque, `A1-A5` e `1-5` valem.
- O bot mostra o que entendeu e só grava com **sim**. Load, embarque, lote ou amostra que não existe cancela **tudo**. O mesmo número em dois grupos é recusado.
- Um resultado repetido **corrige** o anterior, e o bot avisa o valor antigo antes de gravar.
- Se o número do load existir com dois itens, informe `item 444`.
- Só Admin e Operador registram.

### Alarme
**B.L (72h e 120h) a partir de 50** e **C.T a partir de 200** mostram 🚨 na própria confirmação e nas consultas. `<10` nunca alarma; `>N` alarma se N já estiver no limite ou acima. O mesmo alarme vai para o relatório diário do concentrado (etapa seguinte).

### Consultas
```
quais ct tenho para ler hoje?
quais bl72 tenho para ler hoje?
quais bl120 tenho para ler hoje?
quais cts foram lidos hoje?
```
`para ler hoje` lista o que vence hoje e os **atrasados com a data prevista**, agrupado por load (`load 77001: 6-8`) ou por navio, linha, fase e load (`O.SKY 133 linha 2 fase 2 · load 77010: A1-A5`). `foram lidos hoje` mostra os resultados gravados hoje, com o 🚨 quando passou do limite.
## 15. Relatório do dia (todos os blocos)

O relatório diário de microbiologia sai **numa mensagem só**, com os quatro blocos na ordem da planilha: **FCOJ — Recebimento**, **FCOJ — Embarque**, **NFC — Tank farm** e **NFC — Navio**. Desenho em [`concentrado.md`](concentrado.md), seções 1 e 7.

```
relatório do dia                         os quatro blocos, acompanhando o andamento
relatório do dia completo                só o que já foi lido, com a Situação (ok / não ok)
relatório do dia recebimento             só o bloco pedido (também: embarque, concentrado)
relatório do dia tanques terra           só NFC (também: tanques navio, tanques)
```
`completo` também pode vir depois do filtro (`relatório do dia embarque completo`), e `relatório completo` vale como `relatório do dia completo`.

### O que entra em cada linha
| Linha | O que mostra |
|---|---|
| **C.T 48h, B.L 72h, B.L 120h** (concentrado) | Por load: `77001 (4-5 ✅, 6 🚨, 7)`. No embarque: `O.SKY 133 linha 2 fase 2 - 77010 (A1-A2 ✅, A3)`. Entram os lotes/amostras que **vencem hoje** (+2, +3 e +5 dias do recebimento ou do embarque) |
| **TAB** e **Coliformes** (concentrado) | Uma composta por parêntese: `77001 (1-5 ✅)(6-8 🚨)`. Entram as compostas cuja **leitura** é hoje |
| **Howard** (embarque) | `O.SKY 133 linha 2 fase 2 - 77010 (A1-A5): 2%`, no dia em que foi registrado |
| **TAB** (tank farm) | Por tanque, com a coleta: `42 (coleta 28/09) ✅, 43 (coleta 28/09)` |
| C.T, B.L, Psicrotróficos e Drops (NFC) | Como antes: por tanque, `✅` = lido |

### Marcas e alertas
- **✅** = lido. **🚨** = fora do limite: **B.L a partir de 50** ou **C.T a partir de 200** (`<10` nunca alarma), ou TAB/Coliformes **positivo**.
- Depois das linhas de cada bloco, uma linha de alerta por problema: `🚨 C.T 48h ≥ 200 — 77001: lote 6 = 250`, `🚨 TAB POSITIVO — 77001 (6-8)`.
- No `completo`, cada linha do concentrado termina em `— ok` ou `— não ok` (não ok se algum item lido estiver fora do limite ou positivo). Linha sem leitura fica `-`. Vale também para o **Howard** (não ok acima do limite da tabela `limites_howard`, migration `017`; valor fictício no repositório), para as **leituras de NFC** (placas, seção 15.3) e para os **drops** (não ok = drop com desvio).
- O `completo` termina com `✅ lido: X de Y` e, se faltar leitura, o aviso `⚠️ Ainda há N leituras de hoje por fazer`.
- Depois do `leitura do dia finalizada` (seção 15.1), o relatório termina com `✅ Leitura do dia finalizada por Ana às 16:40.`
- **Drops com desvio** (seção 15.2): o drop "não ok" de hoje aparece com 🚨 no lugar do ✅, mais o alerta `🚨 Drop D5 NÃO OK — tanque 45 (coleta 30/09): desvio aberto, ler até 10/10`. A linha `Desvios:` (embaixo dos drops) mostra as leituras de desvio vencidas ou feitas hoje, e um desvio confirmado gera `🚨 Desvio CONFIRMADO ...`.
- Não há envio por e-mail. Para Excel: exportar do Power BI (CSV) ou do DBeaver (XLSX).

## 15.1 Leitura do dia finalizada

Uma pessoa lê por dia. Em vez de fechar por partes (`concluir drops`, `concluir leitura`, `tabs de hoje lidos`...), ela pode fechar **tudo o que sai hoje de uma vez**. Os comandos por partes continuam valendo; o "finalizada" fecha só o que ainda estiver pendente. Só Admin e Operador.

```
leitura do dia finalizada               (também: leitura de hoje finalizada, leitura finalizada, finalizar leitura do dia)
```

```
LabFlow: ❓ Marcar como lido tudo o que sai hoje (05/10)?
         NFC tank farm: 6 leituras · Drops: 4 · TAB: 2 · Coliformes: 1
         TAB e Coliformes sem crescimento ficam *Negativo*.
         ⚠️ C.T/B.L do concentrado: 12 resultados sem valor. Continuam pendentes até você digitar.
         ℹ️ 1 em confirmação não entra (precisa do resultado).
Você:    sim
LabFlow: ✅ Leitura do dia finalizada por Ana. Relatório do dia: todo lido, menos 12 resultados de C.T/B.L (digite os valores).
```

| O que sai hoje | O que o "finalizada" faz |
|---|---|
| Leituras de NFC (pré-leitura e leitura final de C.T, B.L, Psicrotróficos) e drops | Marca como lido, com quem leu |
| TAB e Coliformes no dia da leitura | Fecha como **Negativo** |
| TAB e Coliformes **em confirmação**, lotes de composta aberta, desvios de drop | **Não mexe** (precisam do resultado) |
| C.T e B.L do concentrado (valor numérico) | **Ficam pendentes** até digitar o valor |
| Placas de NFC que ninguém digitou (seção 15.3) | Entram como **<1** nas 3 placas (origem automática) |

O dia fica registrado na tabela `leituras_finalizadas` (migration `011`). Se der o comando de novo no mesmo dia, vale o último.

## 15.2 Desvio de drop

Drop **não ok** abre um **desvio**: o drop de arquivo é repetido em **3 temperaturas (7, 13 e 25 °C)** por **até 5 dias**. O drop é rastreado pela **coleta** (a data do comando é a da coleta). Só Admin e Operador abrem e fecham; consultar, todos.

```
drop d5 do tanque 45 data 30/09/2026 não ok                    abrir (pergunta antes; os 5 dias contam do "sim")
drop d10 do tanque 1C navio O.SKY 123 coleta 28/09/2026 não ok  tanque de navio
desvio do drop d5 tanque 45 confirmou em 13 e 25 graus          resultado (uma ou mais temperaturas; pergunta antes)
desvio do drop d5 tanque 45 não confirmou                       nenhuma temperatura confirmou
quais últimos desvios de drops do tanque 45?                    histórico do tanque (data, temperaturas, quem)
quais desvios estão abertos?                                    desvios em confirmação, com o prazo
```

- Ao abrir, o drop conta como lido (com 🚨 no relatório do dia) e o desvio fica **em confirmação** até o analista passar o resultado, que pode sair **antes** dos 5 dias.
- No resultado, a data da coleta é opcional: sem ela, o bot pega o desvio aberto daquele tanque e drop.
- Temperaturas válidas: 7, 13 e 25 °C (o banco também confere). Um desvio por drop.
- Tabela `desvios_drop` e view `vw_desvios_drop` (migration `012`).

## 15.3 Placas de NFC (triplicata) e desvio de tanque

Especificação: [`docs/specs/nfc-resultados-placas.md`](specs/nfc-resultados-placas.md) (v1.0). Cada leitura de C.T, B.L e WORT (Psicrotróficos) é feita em **3 placas**, no frasco Normal e no Stress. O analista manda **o número de cada placa** só das leituras que **cresceram**; as outras entram como **"<1"** quando a leitura do dia é finalizada (seção 15.1).

```
<análise> do tanque <t> [navio <navio e viagem>] <normal|stress> <placa 1>,<placa 2>,<placa 3> [coleta dd/mm/aaaa]
```

| Análise no comando | Leitura | Exemplo |
|---|---|---|
| `ct` | C.T 48h (final) | `ct do tanque 47 normal 12,8,15` |
| `bl72` | B.L 72h (pré-leitura) | `bl72 do tanque 47 stress 0,1,0` |
| `bl120` (ou só `bl`) | B.L 120h (final) | `bl120 do tanque 5 navio O.SKY 123 normal 0,0,2` |
| `wort profundidade 120h` / `240h` | WORT Profundidade | `wort profundidade 240h do tanque 47 normal 0,0,1` |
| `wort superficie 120h` / `240h` | WORT Superfície | `wort superficie 120h do tanque 47 stress 1,0,0` |

- **Sempre as 3 placas**, na ordem da bancada. `0` ou `<1` = sem colônia; `>300` = incontável. Separador: vírgula ou "e" ("30, 12 e 8").
- A leitura é a **prevista para hoje** daquele tanque e frasco (ou a mais recente atrasada). Para outra coleta, acrescente `coleta dd/mm/aaaa`.
- O bot mostra o resultado e pede **sim**: ✅ **ok** (nenhuma placa acima do limite) ou 🚨 **não ok** (alguma acima). A pré-leitura (B.L 72h, WORT 120h) acima do limite **já é não ok**. Gravar as placas marca a leitura como feita, com quem leu. Mandar de novo substitui os valores.
- Os **limites** ficam na tabela `limites_nfc` (migration `016`), com vigência. O repositório só tem valores **fictícios** (`db/seeds/limites_nfc_exemplo.sql`); os reais são carregados por um arquivo fora do Git.

```
Você:    ct do tanque 47 normal 30, 12 e 8
LabFlow: ❓ C.T 48h do tanque 47 (Normal), coleta 07/10/2026: 30, 12, 8 → 🚨 *não ok*.
         Depois de gravar, pergunto se abre o desvio.
         Responda *sim* para gravar ou *não* para cancelar.
Você:    sim
LabFlow: ✅ Gravado: C.T 48h do tanque 47 (Normal), coleta 07/10/2026: 30, 12, 8 → 🚨 não ok.
         Por: Ana

         ❓ Abrir desvio do tanque 47 (C.T 48h, Normal)? A análise é repetida com o frasco de arquivo, em triplicata e com os mesmos prazos. Responda *sim* ou *não*.
Você:    sim
LabFlow: ⚠️ Desvio criado do tanque 47 (C.T 48h, Normal). Repetição com o frasco de arquivo, em triplicata e com os mesmos prazos.
```

### Desvio de tanque e repetição

- **Não ok em C.T, B.L ou WORT**: o bot pergunta se abre o desvio (como no desvio de drop). Com "sim", o desvio é aberto e a **repetição** é criada: uma análise nova **só daquela análise**, com o frasco de arquivo, em triplicata e com os mesmos prazos contados de hoje. Com "não", fica só o 🚨 no relatório e no painel.
- As leituras da repetição entram com os **mesmos comandos de placas** (a repetição é a leitura prevista para o dia). A **nova contagem fecha o desvio sozinha**: alguma placa acima do limite → **repetição não ok**; leitura final ok → **repetição ok**.
- Para registrar quem fez a repetição:

```
repetição do tanque 47 stress bl120        (também: reanálise do tanque 47 ...; frasco e análise são opcionais)
```

- **"Reanálise" e "repetição" são o mesmo comando** e **nunca** viram análise nova (nem pela IA). Só vale para o que **já deu não ok**: sem desvio aberto, o bot responde "O tanque 47 não tem desvio aberto... A repetição só vale para leitura acima do limite."
- `quais desvios estão abertos?` e `quais desvios do tanque 47?` mostram os desvios de **drop e de tanque**.

### No relatório e no painel

- Relatório do dia: o tanque com leitura não ok aparece com 🚨 e a contagem (`47 🚨 (30, 12, 8)`), mais o alerta `🚨 C.T 48h NÃO OK — tanque 47 (Normal): 30, 12, 8`. A repetição aparece como `47 (repetição)`, e a linha **Desvios de tanque** lista os em repetição e os fechados hoje.
- Painel: páginas **Análise TT** (tanques de terra) e **Análise T.N** (tanques de navio), com o resultado das placas, a tendência do C.T por coleta e os desvios de tanque.

## 16. Comando por áudio

Qualquer comando pode ser **falado** num áudio do WhatsApp (até **1 minuto**). O Gemini transcreve, o bot responde **🎤 Ouvi: "..."** para a pessoa conferir, e o texto segue **direto para a IA**, que monta o comando oficial e **sempre pede "sim"** antes de gravar (a transcrição pode errar, e alguns comandos da regex gravariam sem perguntar). Consultas respondem direto.

```
Você:    🎤 (áudio) "o cê tê do tanque quarenta e sete normal deu doze, oito e quinze"
LabFlow: 🎤 Ouvi: "O C.T do tanque 47 normal deu 12, 8 e 15"
LabFlow: ❓ C.T 48h do tanque 47 (Normal), coleta 07/10/2026: 12, 8, 15 → ✅ *ok*.
         Responda *sim* para gravar ou *não* para cancelar.
Você:    🎤 (áudio) "sim"
LabFlow: ✅ Gravado: ...
```

- "Sim" e "não" falados (ou escritos com ponto: "Sim.") confirmam e cancelam.
- Áudio sem fala, que não deu para entender, ou de até 2 segundos que não seja "sim" ou "não" (clique sem querer): "🎤 Não entendi o áudio. Pode repetir ou mandar por escrito?" No silêncio a transcrição pode inventar palavras, então áudio curto nunca vira comando.
- Quem não é cadastrado é bloqueado antes da transcrição (sem custo de IA). O áudio **não é guardado**: a Evolution entrega o arquivo ao n8n só para a transcrição.
- Fluxo no n8n: `Evolution · Baixar áudio` → `Áudio em arquivo` → `Gemini · Transcrever áudio` → `Montar transcrição` → `Zap · Ouvi` → `Reenviar áudio como texto` (marca `labflowAudio`, que o `Interpretar comando` manda direto para a IA).
