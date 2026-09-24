# Comandos do LabFlow

Lista dos comandos reconhecidos pelo bot do WhatsApp, com o formato esperado e um exemplo de cada. O reconhecimento é feito por expressões regulares num nó de código do n8n, a partir do texto da mensagem recebida.

## Regras gerais

- **Mensagens do próprio número pareado são ignoradas.** O bot não processa mensagens enviadas por ele mesmo.
- **Mensagens com mais de 10 minutos são descartadas.** Evita reprocessar mensagens antigas se o serviço ficar fora do ar por um tempo e voltar.
- **Só números cadastrados usam o bot.** Quem não está na aba `USUARIOS` recebe uma mensagem pedindo cadastro e nenhum comando é executado.
- Os comandos abaixo não diferenciam maiúsculas de minúsculas.

## Cargos e permissões

| Cargo | Registrar (coleta, análise, amostra, concluir drops) | Consultar | Gerenciar cargos |
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

## 10. Amostra

Não tem uma frase fixa. Qualquer mensagem contendo `amostra <número>` — e, opcionalmente, `analise <tipo>` e uma data `dd/mm/aaaa` — é reconhecida como registro de amostra. Este é também o comportamento padrão quando a mensagem não corresponde a nenhum dos comandos acima.

**Exemplo:**
```
amostra 123 analise fisico-quimica 20/09/2026
```
