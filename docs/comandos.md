# Comandos do LabFlow

Lista dos comandos reconhecidos pelo bot do WhatsApp, com o formato esperado e um exemplo de cada. O reconhecimento é feito por expressões regulares num nó de código do n8n, a partir do texto da mensagem recebida.

## Regras gerais

- **Mensagens do próprio número pareado são ignoradas.** O bot não processa mensagens enviadas por ele mesmo.
- **Mensagens com mais de 10 minutos são descartadas.** Evita reprocessar mensagens antigas se o serviço ficar fora do ar por um tempo e voltar.
- **Só números cadastrados usam o bot.** Quem não está na aba `USUARIOS` recebe uma mensagem pedindo cadastro e nenhum comando é executado.
- Os comandos abaixo não diferenciam maiúsculas de minúsculas.

## Cargos e permissões

| Cargo | Registrar (coleta, análise, amostra, concluir drops e leituras) | Consultar | Gerenciar cargos |
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
```

## 5. Consultar potes para descarte (navio)

```
quais potes navio descartar hoje
quais potes do navio posso descartar hoje
```

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

Aceita "do"/"dos" e singular/plural. Limite de 8 tanques para terra e 16 para navio. A palavra `navio` é obrigatória nas análises de navio, porque é ela que diferencia terra de navio na regex. Aceitar variações sem essa palavra fica para a fase de IA.

Cada tanque gera 4 linhas na aba `ANALISES`:

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

Marca como `Concluído` todas as linhas da aba `DROPS` com status `Pendente` e data prevista hoje que batem no filtro. O dia (D5/D10/D15) e o nome do navio são opcionais. Sem eles, conclui todos os estágios e todos os navios. A resposta lista os tanques e as datas de coleta concluídos.

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

1. O bot **não altera nada ainda**. Ele lista as leituras encontradas e pergunta se pode concluir. A pendência fica guardada na aba `CONFIRMACOES_PENDENTES`.
2. O analista responde com uma mensagem só com **`sim`** (confirma) ou **`não`**/**`nao`** (cancela). A pendência expira em **10 minutos**; depois disso é preciso mandar o comando de novo. Se a data da pendência não puder ser lida, ela também é tratada como expirada (é mais seguro recusar do que confirmar sem saber a idade).

Ao confirmar, cada linha muda de status na aba `ANALISES`:

| Status atual | Data que precisa ser hoje | Novo status |
|---|---|---|
| Aguardando Pré-Leitura | Data Pre-Leitura | Aguardando Leitura Final |
| Aguardando Leitura Final | Data Leitura Final | Concluído |

O nome de quem confirmou fica registrado na coluna `Pre-Leitura Feita Por` ou `Leitura Final Feita Por`, conforme o estágio concluído.

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

## 11. Amostra

Não tem uma frase fixa. Qualquer mensagem contendo `amostra <número>` — e, opcionalmente, `analise <tipo>` e uma data `dd/mm/aaaa` — é reconhecida como registro de amostra. Este é também o comportamento padrão quando a mensagem não corresponde a nenhum dos comandos acima.

**Exemplo:**
```
amostra 123 analise fisico-quimica 20/09/2026
```
