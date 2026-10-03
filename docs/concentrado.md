# Desenho do módulo de concentrado (FCOJ) e testes de composta

**Estado:** desenho para revisão (01/10/2026). Nada disto está implementado. A migration [`002_concentrado.sql`](../db/migrations/002_concentrado.sql) é um rascunho anterior e será reescrita a partir deste documento.

Todos os exemplos usam **dados fictícios**.

## 1. Objetivo: o relatório diário

O laboratório envia todo dia um relatório com tudo o que **saiu (foi lido) no dia**, em quatro blocos:

| Bloco | Linhas |
|---|---|
| FCOJ — Recebimento | C.T 48h, B.L 72h, B.L 120h, TAB, Coliformes |
| FCOJ — Embarque (navio) | C.T 48h, B.L 72h, B.L 120h, Coliformes, Howard, TAB |
| NFC — Tank farm (normal e stress) | C.T 48h, B.L 72h, B.L 120h, Psicrotróficos 120h e 240h (WORT), Drops 5/10/15, TAB |
| NFC — Navio (normal e stress) | as mesmas, menos TAB |

Cada linha tem a identificação compacta do que saiu e a **Situação**. Exemplos do formato (fictícios):

```text
C.T 48h      77001 (12,14,15); 77002 (1-12,15)        ok
Coliformes   77003 (1-5)(6-10)(11,12,15)              ok
C.T 48h      O.STAR 112 - 77010 (A1-A5)               ok
```

Cada consulta "o que sai hoje" do bot é um pedaço desse relatório. O objetivo final é o bot **gerar o relatório sozinho**.

**Situação:** `ok` = lido e dentro do limite. `não ok` = algo fora do esperado (contagem acima do limite, crescimento inesperado, contaminação), com a explicação no e-mail. Os limites e o "não ok" serão calibrados depois. Primeiro entra o que já foi decidido.

## 2. Regras gerais (decididas)

1. **A ordem é sempre: recebimento → compostas → testes.** TAB e Coliformes só existem sobre compostas de lotes já recebidos. No embarque, TAB, Coliformes e Howard só depois das amostras do embarque. O bot recusa teste de lote ou amostra que não existe.
2. **As compostas são criadas no recebimento** (criadas, não analisadas). TAB e Coliformes são feitos **da mesma composta**: um id só, ligado aos dois testes.
3. **A composta é livre:** de 1 a N lotes, em qualquer combinação (`1-5`, `11,12,15`, `3`). Lotes que faltaram ou chegaram atrasados entram em outra composta, em outro dia.
4. **Notação de compostas:** a mesma do relatório, com um parêntese por composta: `(1-5)(6-10)(11,12,15)`. Dentro do parêntese, `-` é faixa e `,` separa lotes.
5. **Cada composta tem um número curto** (`#12`), mostrado pelo bot em toda resposta que lista compostas. O número é um atalho. O formato completo (load + lotes) também funciona sempre.
6. **Toda gravação mostra o que o bot entendeu e só grava com "sim"** (como hoje na IA e nas leituras).
7. **Analista em toda etapa:** criar, espalhar, incubar, confirmar e dar resultado registram **quem fez** (pelo número cadastrado) e **quando**. No banco: `*_por` (usuário) e `*_em` (data e hora).
8. **Atrasados:** o que não foi feito no dia previsto continua aparecendo, com a **data em que era para ser feito**: `⚠️ TABs atrasados para espalhar — previsto 05/10/2026`.
9. Regex primeiro; o que não bater vai para a IA. Permissão (Consultor não grava) conferida no código.

## 3. Ciclo do TAB

O mesmo ciclo vale para **compostas de recebimento**, **compostas de embarque** e **tanques de NFC (tank farm)**.

```text
 Tab feito ──► NO CALDO ──(+5 dias)──► "tabs de hoje espalhados" ──► INCUBADA ──(+5 dias)──► leitura
                                                                        │                       │
                                              cresceu algo (qualquer dia)│                       ├─ nada cresceu → NEGATIVO ✔
                                                                        ▼                       │   ("tabs de hoje lidos")
                                                              EM CONFIRMAÇÃO (PCA 24h) ◄────────┘ cresceu
                                                                        │
                                                   "confirmação do tab #13 positivo/negativo"
                                                                        ▼
                                                              POSITIVO ✔ ou NEGATIVO ✔
```

| Status | Entra quando | Data prevista |
|---|---|---|
| `No caldo` | "Tab feito" confirmado | espalhar = feito + 5 dias |
| `Incubada` | "tabs de hoje espalhados" confirmado | leitura = espalhamento + 5 dias |
| `Em confirmação` | "tab #13 em confirmação" (qualquer dia da incubação ou na leitura) | confirmação = dia seguinte (PCA 24h) |
| `Concluída` | resultado Positivo ou Negativo gravado | — |

### Comandos e consultas do TAB

| # | Mensagem | Resposta |
|---|---|---|
| 1 | `Tab feito do load 77001, compostas (1-5)(6-10)` · `tab feito das compostas #12 a #14` · `tab feito do load 77001` (todas as compostas do load sem TAB) | Lista numerada → **sim** → "✅ 2 TABs no caldo. Espalhar em 06/10/2026." |
| 2 | `quais tabs tenho para espalhar hoje?` | Compostas no caldo com espalhar = hoje + atrasados |
| 3 | `tabs de hoje espalhados` | "Você espalhou #12, #13. Mudar para **Incubada**?" → **sim** |
| 4 | `quais tabs tenho para ler hoje?` | Incubadas com leitura = hoje + atrasadas + confirmações que vencem hoje |
| 5 | `tab #13 em confirmação` · `Tab da composta load 77001, lotes 6-10, em confirmação` | "✅ #13 em confirmação (PCA 24h). Ler em DD/MM." |
| 6 | `confirmação do tab #13 positivo` (ou `negativo`) | "Confirmar resultado POSITIVO do #13?" → **sim** |
| 7 | `tabs de hoje lidos` | "Leu #12 e #14 (sem crescimento). Todas **negativas**?" → **sim**. As em confirmação ficam de fora |
| 8 | `quais tabs foram lidos hoje?` | Concluídas hoje, com o resultado de cada uma |

## 4. Coliformes

Mesma composta do TAB (no recebimento) e do Howard (no embarque). Resultado **Positivo ou Negativo**.

| Status | Entra quando | Data prevista |
|---|---|---|
| `No caldo` | "Coliformes feitos" confirmado | estriar = feito + 2 dias |
| `Estriada` | "coliformes de hoje estriados" confirmado | leitura = estria + 1 dia (3º dia) |
| `Em confirmação` | "coliformes em confirmação" → bot pergunta se **abre a composta** → **sim** | cada lote: caldo hoje → estriar amanhã (+1) → ler no dia seguinte (+2) |
| `Concluída` | resultado gravado (composta inteira negativa, ou todos os lotes da composta aberta com resultado) | — |

**Confirmação = abrir a composta.** Quando a composta sinaliza, ela é aberta e **cada lote é analisado separado**, para saber qual lote deu positivo:

```text
Você:    composta load 77001, lotes 1-5, coliformes em confirmação   (ou: coliformes #12 em confirmação)
LabFlow: ❓ Abrir a composta #12 load 77001 (1-5) e analisar lote por lote?
         Vão entrar 5 confirmações: #12.1, #12.2, #12.3, #12.4, #12.5. Responda sim ou não.
Você:    sim
LabFlow: ✅ Composta #12 aberta: lotes 1, 2, 3, 4 e 5 em confirmação.

Você:    composta load 77001, lote 3, da confirmação deu positivo   (ou: coliformes #12.3 positivo)
LabFlow: ❓ Confirmar POSITIVO de coliformes no lote 3 da composta #12? sim/não
```

- Cada lote da composta aberta ganha um código `#12.3` (composta 12, lote 3), mostrado pelo bot.
- Resultado da composta: **positiva** se algum lote der positivo, com o(s) lote(s) apontados; **negativa** se todos os lotes derem negativo.
- Cada lote da composta aberta tem o próprio ciclo curto: **caldo (dia 0) → estria (dia 1) → leitura (dia 2)**. Ele aparece em `quais coliformes tenho para estriar hoje?` no dia 1 e em `quais coliformes tenho para ler hoje?` no dia 2, e `coliformes de hoje estriados` também vale para esses lotes.

Comandos: `Coliformes feitos do load 77001, compostas (1-5)(6-10)` · `quais coliformes tenho para estriar hoje?` · `coliformes de hoje estriados` · `quais coliformes tenho para ler hoje?` · `coliformes de hoje lidos` (sem crescimento → negativas, com "sim") · `coliformes #12 em confirmação` · `coliformes #12.3 positivo` · `quais coliformes foram lidos hoje?`.

## 5. Howard

**Só no embarque**, feito da composta do embarque (a mesma de Coliformes). É uma análise de **um dia só**: não tem caldo, estria nem confirmação. Lido em 50 campos, cada campo positivo vale 2%; o analista já manda a porcentagem.

```text
Você:    Analise da composta de Howard do navio O.SKY 133 linha 2 fase 2 amostras 1-5, foi 2%
         (ou: howard #20 2%)
LabFlow: ❓ Gravar Howard 2% (1 campo positivo de 50) — O.SKY 133, linha 2, fase 2 (A1-A5)? sim/não
```

- O banco guarda o percentual e `campos_positivos` (= percentual ÷ 2). Como são 50 campos, o percentual é sempre **par**; um valor ímpar (ex.: 3%) é recusado com aviso.
- **Sem prazo.** O analista registra a porcentagem com navio, viagem, linha, fase e amostras, e o Howard entra no relatório do dia em que foi registrado.
- `temos análise de howard para hoje?` lista as compostas de embarque que ainda não têm Howard registrado.
- `quais howards foram lidos hoje?` lista os gravados hoje, com o percentual.

## 5.1 TAB de NFC (tank farm)

**Por tanque, sem composta.** Mesmo ciclo do TAB (caldo → espalhar → incubar → confirmação → resultado).

O comando **sempre cita a data da coleta**, porque tanques podem acumular e o mesmo número pode ter mais de uma coleta:

```text
Tab feito dos tanques terra 42,43 coleta 28/09/2026
```

O bot liga o TAB à coleta exata (tanque + data). Se não existir coleta do tanque naquela data, ele recusa e não grava nada, como na análise de tanque.

## 6. Regex das consultas

Rodam sobre o texto normalizado (minúsculas, sem acento, sem `?` no fim). Plural e singular aceitos.

| Consulta | Regex |
|---|---|
| Howard de hoje | `^(temos\|tem\|quais\|qual)?\s*(analises?\s+(de\s+)?)?howards?\s+(para\|pra\|de)\s+hoje$` |
| TAB para espalhar | `^(quais\|qual\|temos\|tem)?\s*tabs?\s+(tenho\|temos\|tem\s+)?(para\|pra)\s+espalhar\s+hoje$` |
| TAB para ler | `^(quais\|qual\|temos\|tem)?\s*tabs?\s+(tenho\|temos\|tem\s+)?(para\|pra)\s+ler\s+hoje$` |
| Coliformes para estriar | `^(quais\|qual\|temos\|tem)?\s*coliformes?\s+(tenho\|temos\|tem\s+)?(para\|pra)\s+estriar\s+hoje$` |
| Coliformes para ler | `^(quais\|qual\|temos\|tem)?\s*coliformes?\s+(tenho\|temos\|tem\s+)?(para\|pra)\s+ler\s+hoje$` |
| Lidos hoje | `^(quais\|qual)\s+(tabs?\|coliformes?\|howards?)\s+(foram\|ja foram)\s+lidos?\s+hoje$` |
| Etapa do dia feita | `^(tabs?\|coliformes?)\s+de\s+hoje\s+(espalhados?\|estriados?\|lidos?)$` |

As regex dos comandos que gravam (com load, compostas e `#`) entram no desenho de implementação, junto com os testes de cada frase.

## 7. Relatório do dia

| Mensagem | O que vem |
|---|---|
| `relatório do dia tanques terra` (ou navio, recebimento, embarque) | O bloco pedido, com **tudo** que sai hoje, para acompanhar o andamento: o que já foi lido vem marcado com ✅ |
| `relatório do dia completo` | Só o que **já foi lido**, no formato do relatório oficial |
| `leitura de hoje finalizada` | O analista libera as leituras **dele** do dia para o relatório completo |

**Barreira contra relatório incompleto:** se alguém pedir o relatório completo e houver leituras do dia ainda não finalizadas, o bot avisa: "⚠️ Ainda há leituras de hoje não finalizadas (TAB 2, Coliformes 1). Enviar mesmo assim?".

Depois (fase E): o mesmo relatório por e-mail e em Excel, no formato da planilha.

## 8. Modelo de dados (rascunho para a nova 002)

```text
fabricas(id, nome)
itens(id, codigo UNIQUE)                          -- cadastro livre
loads(id, numero, item_id, fabrica_id, UNIQUE(numero, item_id))
recebimento_lotes(id, load_id, lote, data_recebimento, registrado_por, ... CT/BL)
compostas(id, numero_curto UNIQUE,                -- o "#12"
          origem 'recebimento' | 'embarque',
          load_id, embarque_id, criada_por, criada_em)
composta_lotes(composta_id, recebimento_lote_id | embarque_amostra_id)
testes(id, tipo 'TAB' | 'COLIFORMES' | 'HOWARD',
       composta_id NULL, coleta_id NULL,           -- composta (FCOJ) ou tanque NFC (TAB do tank farm)
       status, resultado 'Positivo' | 'Negativo' NULL,
       campos_lidos, campos_positivos,             -- só Howard
       feito_por, feito_em,
       espalhar_prevista, espalhado_por, espalhado_em,          -- TAB (estriar no Coliformes)
       leitura_prevista, confirmacao_prevista,
       confirmacao_por, confirmacao_em,
       resultado_por, resultado_em)
leituras_finalizadas(usuario_id, data, finalizada_em)            -- barreira do relatório
```

## 9. Ordem de implementação

| Fase | Entrega |
|---|---|
| A | `relatório do dia` com os blocos de NFC (tanques terra e navio), com os dados que já existem — **feito em 02/10/2026** (`003_relatorio_nfc.sql`, comando em `docs/comandos.md` 8.1) |
| B | Recebimento (loads, lotes) + compostas + **TAB** completo |
| C | **Coliformes** e **Howard** |
| D | C.T e B.L por lote (recebimento) e por amostra (embarque) |
| E | Relatório completo, `leitura de hoje finalizada`, e-mail e Excel |
| F | Situação (ok / não ok) e resultado por foto ou áudio |

## 10. Recebimento (comandos decididos)

Dois comandos separados, porque lotes atrasados podem completar compostas em outro dia:

```text
recebimento load 77001 item 444 fabrica AQA lotes 1-14
compostas do load 77001 (1-5)(6-10)(11-14)
```

- O recebimento registra os lotes (e agenda C.T e B.L de cada lote, fase D).
- As compostas só aceitam lotes já recebidos daquele load; o bot devolve a lista numerada (`#12`, `#13`...) e grava com **sim**.
- No embarque, a composta é por navio, viagem, linha, fase e amostras: `compostas do navio O.SKY 133 linha 2 fase 2 (A1-A5)(A6-A10)`.

## 11. Em aberto

Nada no momento. Todas as perguntas do desenho foram respondidas em 01/10/2026.
