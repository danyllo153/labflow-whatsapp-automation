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

No navio, os tanques vêm agrupados por navio, como na planilha: `O.SUN 156 (1A ✅, 1F); O.SKY 133 (2P)`. `relatório do dia` sozinho traz os dois blocos (tank farm e navio); quando o módulo de concentrado existir, ele passa a ser o relatório completo (ver `docs/concentrado.md`). A linha TAB fica com `-` até a fase B.

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
