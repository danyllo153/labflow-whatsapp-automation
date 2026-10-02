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

## 4. Coliformes (mesmo molde do TAB)

Mesma composta do TAB. Resultado **Positivo ou Negativo**.

| Status | Entra quando | Data prevista |
|---|---|---|
| `No caldo` | "Coliformes feitos" confirmado | estriar = feito + 2 dias |
| `Estriada` | "coliformes de hoje estriados" confirmado | leitura = estria + 1 dia (3º dia) |
| `Concluída` | resultado gravado | — |

Comandos: `Coliformes feitos do load 77001, compostas (1-5)(6-10)` · `quais coliformes tenho para estriar hoje?` · `coliformes de hoje estriados` · `quais coliformes tenho para ler hoje?` · `coliformes de hoje lidos` · `quais coliformes foram lidos hoje?` · resultado individual: `coliformes #12 positivo`.

## 5. Howard

Só no embarque. Lido em 50 campos; cada campo positivo vale 2%. O banco guarda `campos_lidos` (50) e `campos_positivos` e calcula a porcentagem.

Comandos: `temos análise de howard para hoje?` · `howard #20 3 campos positivos` (→ 6%) · `quais howards foram lidos hoje?`.

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
| `relatório do dia tanques terra` (ou navio, recebimento, embarque) | O bloco pedido, com **tudo** que sai hoje (lido ou ainda não), para acompanhar o andamento |
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
| A | `relatório do dia` com os blocos de NFC (tanques terra e navio), com os dados que já existem |
| B | Recebimento (loads, lotes) + compostas + **TAB** completo |
| C | **Coliformes** e **Howard** |
| D | C.T e B.L por lote (recebimento) e por amostra (embarque) |
| E | Relatório completo, `leitura de hoje finalizada`, e-mail e Excel |
| F | Situação (ok / não ok) e resultado por foto ou áudio |

## 10. Em aberto

1. **Howard:** quando é lido (no mesmo dia da composta ou com prazo)?
2. **Coliformes:** existe etapa de confirmação, como no TAB?
3. **TAB de NFC:** é por tanque (uma amostra por tanque) ou também em composta?
4. **Recebimento:** formato exato do comando de lotes e de compostas (ex.: `recebimento load 77001 item 444 fabrica AQA lotes 1-14` e `compostas do load 77001 (1-5)(6-10)(11-14)`).
5. **Relatório "em andamento" por bloco:** deve marcar o que já foi lido (✅), como a consulta de análises faz hoje?
