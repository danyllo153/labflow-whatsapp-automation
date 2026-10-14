---
title: LabFlow — Leitura de laudo por foto
tags: [labflow, spec, foto, ia]
status: fase 1 implementada
version: v0.2
created: 2026-10-14
---

# Leitura de laudo por foto

> **Status:** decisões tomadas com o Danyllo em 14/10/2026, a partir de fotos de laudos preenchidos à mão. As fotos **ficam só na conversa** (têm o logotipo da empresa): nunca no repositório, nos testes nem nas notas. Os testes usam respostas simuladas da IA e imagens fictícias.

## Objetivo
Em vez de falar ou digitar parte por parte, a pessoa manda a **foto do laudo preenchido** no WhatsApp. A IA lê, o código valida, o bot mostra o que entendeu e pede **um "sim"** para a lista toda. Nada grava sem confirmação.

## Fluxo
1. Foto no WhatsApp (a legenda é opcional, mas é obrigatória para "confirmação", ver abaixo).
2. O bot baixa a imagem, conta no **limite diário de IA** (tipo `foto`) e envia ao Gemini (visão), com o Gemini 3.8 Flash de reserva. O Groq **não lê imagem**.
3. A IA descobre **qual formulário é** (pelo título) e devolve **só dados estruturados**, nunca comandos. Marca o que ficou em dúvida.
4. O **código valida** (fábrica, load, item, datas, lotes, composta existente) e **monta a lista de comandos oficiais**.
5. O bot responde com o resumo, os pontos de dúvida e as compostas encontradas (`#N`), e pede **sim**. Uma pendência guarda a **lista** de comandos; o "sim" executa em ordem.
6. Falha ou dúvida grave: o bot diz o que não entendeu e pede para usar o comando. Nada é gravado.

## Formulários (fase 1)
| Formulário | O que a IA lê | Comandos montados |
|---|---|---|
| **Recebimento** | load, fábrica, item, data da análise, lotes e as **marcas de composta** | `recebimento ...` e `compostas do load ...` |
| **TAB** (caldo, sem marcas) | load e faixas de lotes (recebimento), item e fábrica do bloco, data | `tab feito ...` de cada composta |
| **Coliformes** (caldo, sem marcas) | o mesmo, mais navio, linha e fase no embarque | `coliformes feitos ...` |

Fases seguintes: resultados de C.T e B.L por lote (ignorando o riscado), confirmação por "+", embarque.

## Decisões
- **Marca de composta:** uma barra ou um ponto depois do número do último lote da composta; o número seguinte abre a próxima. O **último lote fecha a última composta** mesmo sem marca. Sem nenhuma marca: grava só o recebimento e avisa que não criou compostas. Pode-se usar **barra `|` ou `/` em caneta** (o lápis perde contraste na foto); o ponto continua valendo.
- **Compostas por faixas:** `1-5`, `15,16`, `1-3,5,6` etc. Lotes não contínuos valem, na ordem das linhas.
- **Data:** "Data da Análise" é a data do recebimento (a análise de recebimento).
- **Resultado:** `+` = detectado, `−` = não detectado. **Riscado não vale**: lê-se o valor que substituiu.
- **O número `#N` não aparece no papel.** O bot acha a composta **já existente** com o mesmo load e os mesmos lotes (a mesma busca de `tab feito do load 43598, item 2703, lotes 1-5`) e mostra o `#N` na confirmação. Se a composta não existir ou os lotes não baterem, avisa qual linha falhou; **nunca cria composta sozinho** (no embarque, as compostas só se criam quando o carregamento do load termina).
- **Observação:** em Coliformes, costuma trazer **fábrica e item** (`COL 2648`); serve para conferir com o banco.
- **TAB/Coliformes só têm foto no caldo.** Incubação, espalhar e leitura continuam por comando (`tabs de hoje incubados`, `tabs de hoje espalhados`, `tabs de hoje lidos`).
- **"+" a lápis na foto só vale com a palavra `confirmação` na legenda.** Sem a palavra, o bot não registra e pede para reenviar com a legenda.
- **Tanques de NFC** listados no TAB (`42  17/08`): tanque + **data da coleta**, ano = o atual (se a data ficaria no futuro, o ano anterior). Vira `tab feito dos tanques terra 42,43 coleta 17/08/2026`.
- **Fábricas travadas:** AQA (Araraquara), CON (Conchal), COL (Colina), UCH (Uchoa), ITA (Itápolis), TMG (Terminal Guarujá). O nome vira a sigla, a leitura torta (`AOQ`) vira a sigla parecida só se for única, e o bot avisa; outra é recusada. O prompt da foto recebe a lista fechada. (Implementado, ver `comandos.md` 16.3.)
- **Navios** ("Orange Sky" = O.SKY) e **tanques de navio** (1 center = 1C, PS = P, starboard = S): implementado.

### Embarque (fase seguinte)
- Identificação **sempre ancorada em navio + viagem** (ex.: `O.Star 112`).
- Linhas do laudo: `43480 L3/F2` (load, linha/fase), `43173/43371 L2/F1` (dois loads na mesma linha e fase = a composta daquela linha e fase), ou o formato antigo `43478 A1-A3` (load e amostras, sem linha e fase).
- Ordem de busca da composta **já existente**: (1) navio + viagem + linha/fase, se escritos; (2) sem linha/fase: navio + viagem + load (+ amostras); (3) sem load: navio + viagem + linha/fase. Se a composta existe, é porque o embarque já foi analisado. Sempre mostra o que achou e pede o sim.
- **Sem criar composta automática** na foto do embarque.

## O que continua fora
- Ler laudo sem confirmação.
- Engenharia reversa ou cópia de qualquer sistema de terceiros.
- Foto de laudo no repositório.

## Riscos e limites
- A foto depende de IA com visão: se o Gemini estiver sobrecarregado nos dois modelos, o bot avisa e pede o comando (o Groq não lê imagem).
- Letra de mão e rasuras: por isso a confirmação sempre mostra a leitura e marca dúvidas.
- Privacidade: no plano gratuito o Google pode usar o conteúdo; o gestor autorizou a foto de laudo no piloto. Para uso definitivo, plano pago com teto de gasto.
- O "sim" agora executa uma **lista** (pendência payload.comandos), um comando por vez, na ordem; antes confirmava um só.
- **Fase 1 (feita):** recebimento + compostas, TAB e Coliformes de caldo (load e lotes), tanques de NFC. **Fase 2:** resultados de C.T/B.L por lote e o "+" da confirmação (palavra confirmação na legenda). **Fase 3:** laudos de embarque.
