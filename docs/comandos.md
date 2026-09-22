# Comandos do LabFlow

Lista dos comandos reconhecidos pelo bot do WhatsApp, com o formato esperado e um exemplo de cada. O reconhecimento é feito por expressões regulares num nó de código do n8n, a partir do texto da mensagem recebida.

## Regras gerais

- **Mensagens do próprio número pareado são ignoradas.** O bot não processa mensagens enviadas por ele mesmo.
- **Mensagens com mais de 10 minutos são descartadas.** Evita reprocessar mensagens antigas se o serviço ficar fora do ar por um tempo e voltar.
- Os comandos abaixo não diferenciam maiúsculas de minúsculas.

## 1. Registrar coleta de terra

```
registrar coleta tanque terra <número> data <dd/mm/aaaa>
```

**Exemplo:**
```
registrar coleta tanque terra 42 data 20/09/2026
```

Gera um ID de coleta, calcula as três datas de drop (D5, D10, D15) e a data de arquivamento (365 dias depois da coleta).

## 2. Registrar coleta de navio

```
Coleta navio <nome do navio> tanques <lista separada por vírgula> data <dd/mm/aaaa>
```

**Exemplo:**
```
Coleta navio O.SKY tanques 1C,2P,2S,3S data 20/09/2026
```

Repete o cálculo de drops e arquivamento para cada tanque informado na lista.

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

Os cargos válidos são **Admin** ou **Operador**. O nome é opcional; se omitido, o sistema tenta usar o nome já cadastrado (ou o nome de contato do WhatsApp, se o alvo for quem está enviando a mensagem).

## 7. Amostra

Não tem uma frase fixa. Qualquer mensagem contendo `amostra <número>` — e, opcionalmente, `analise <tipo>` e uma data `dd/mm/aaaa` — é reconhecida como registro de amostra. Este é também o comportamento padrão quando a mensagem não corresponde a nenhum dos comandos acima.

**Exemplo:**
```
amostra 123 analise fisico-quimica 20/09/2026
```
