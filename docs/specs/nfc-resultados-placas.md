---
title: LabFlow — Resultados de NFC placa a placa
tags: [labflow, spec, nfc, tanques]
status: draft
version: v0.1
created: 2026-10-07
---

# Resultados de NFC placa a placa (C.T, B.L e WORT)

> **Status:** planejamento (`v0.x`). Vira tarefa e código só quando estiver `v1.0`, aprovada pelo Danyllo.
> **Parte da Fase 0** (Situação ok/não ok em todo o relatório) e base da tendência por tanque no painel.

## Direção desta edição

Hoje a leitura de NFC só marca **lido** e quem leu, sem o resultado. Passa a gravar **o número de cada placa** (triplicata) de cada leitura, no frasco Normal e no Stress. O analista digita **só as placas que cresceram**; o resto entra como **"<1"** quando a leitura do dia é finalizada. Com os números, cada leitura ganha **ok / não ok** (✅ / 🚨) no relatório e no painel, e o painel ganha **tendência por tanque**. No B.L e no WORT, não ok **abre um desvio de tanque**, tratado com uma **repetição**: a análise é refeita com o **frasco de arquivo**, como uma análise nova.

## O que já existe

- Cada análise registrada gera 4 linhas em `analises` por tanque e frasco: C.T (Profundidade), B.L (Profundidade), WORT Profundidade e WORT Superfície. Prazos contados da **data da análise**: C.T 48h; B.L pré-leitura 72h e final 120h; WORT pré-leitura 120h e final 240h (`docs/comandos.md`, seção 7).
- A conclusão das leituras (e `leitura do dia finalizada`) marca como lido, com quem leu, sem valor.
- O desvio de drop (migration 012) é o modelo: abre com "sim", tem prazo e resultado, e aparece na página Desvios do painel, que passa a mostrar também os desvios de tanque.

## Decisões (07/10/2026, com o Danyllo)

1. **Triplicata:** toda leitura é feita em **3 placas**, no Normal e no Stress (24 placas por tanque).
2. **Grava todos os números**, placa por placa, mesmo quando ok. Placa sem colônia = **"<1"**.
3. **O analista digita só as placas que cresceram.** As outras entram como "<1" automaticamente na **leitura do dia finalizada**.
4. **Pré-leitura** (B.L 72h e WORT 120h) com resultado fora do limite **já é não ok**.
5. **Limites de aceitação** por análise e etapa ficam numa **tabela do banco**, carregada por um **arquivo fora do Git**. O repositório traz só um arquivo de exemplo com **valores fictícios** (regra do `CLAUDE.md`).
6. **Não ok aparece no relatório (🚨) e no painel.** No **B.L e no WORT**, abre também um **desvio de tanque**, tratado com uma **repetição**: a análise é refeita com o frasco de arquivo, como análise nova, e os prazos voltam a contar.
7. No **C.T**, não ok **só aparece** no relatório e no painel (sem desvio). *(confirmar)*

## Comandos (pensados também para o áudio)

Formato:

```
<análise> do tanque <número> [navio <nome viagem>] <normal|stress> <placa 1>,<placa 2>,<placa 3>
```

| Análise no comando | Leitura | Exemplo |
|---|---|---|
| `ct` | C.T 48h (final) | `ct do tanque 47 normal 12,8,15` |
| `bl72` | B.L 72h (pré-leitura) | `bl72 do tanque 47 stress 0,1,0` |
| `bl120` | B.L 120h (final) | `bl120 do tanque 47 normal 0,0,2` |
| `wort profundidade 120h` / `240h` | WORT Profundidade | `wort profundidade 240h do tanque 47 normal 0,0,1` |
| `wort superficie 120h` / `240h` | WORT Superfície | `wort superficie 120h do tanque 47 stress 1,0,0` |

- `0` e `<1` valem "<1". A ordem das placas é a da bancada (1, 2, 3).
- O tanque é ligado à leitura **prevista para hoje** daquele tanque e frasco (opcional: `coleta dd/mm/aaaa` quando houver mais de uma).
- Antes de gravar, o bot mostra o que entendeu e o resultado (ok / não ok) e pede **sim**.
- Por frase livre e por áudio, a IA monta o mesmo formato ("C.T do tanque 47 normal: doze, oito e quinze").
- `leitura do dia finalizada` passa a preencher com "<1" as placas das leituras de hoje que ninguém digitou.

## Modelo de dados (proposta)

| Tabela / view | O que guarda |
|---|---|
| `leituras_placas` | Uma linha por placa: `analise_id`, etapa (`pre` / `final`), placa (1 a 3), sinal (`<` / `=`), valor, quem leu, quando, origem (`digitado` / `automatico`). Única por análise + etapa + placa |
| `limites_nfc` | Limite máximo por placa, por análise e etapa, com vigência. **Valores reais carregados de um arquivo fora do Git**; exemplo fictício no repositório |
| `desvios_tanque` | Desvio aberto por leitura não ok de B.L ou WORT: análise de origem, **repetição** (análise refeita com o frasco de arquivo), quem abriu, prazo, status e resultado |
| `vw_situacao_nfc` | Situação de cada leitura (ok / não ok) e de cada tanque no dia, para o relatório e o painel |

Migration `016`. Testada antes numa transação desfeita, com backup antes de aplicar.

## Relatório e painel

- **Relatório do dia:** cada tanque na linha da leitura com ✅ (ok) ou 🚨 (não ok); sem marca = ainda não lido.
- **Painel:** Situação ok / não ok nas leituras; depois, a página Tanques se divide em **Análise TT** (tanques de terra) e **Análise T.N** (tanques de navio), com **tendência** dos números por tanque.

## Perguntas a responder

- [ ] Confirmar: C.T não ok **não** abre desvio (só relatório e painel)?
- [ ] O desvio de tanque abre sozinho ao gravar o não ok, ou o bot pergunta "abrir desvio?" (como no desvio de drop)?
- [ ] A repetição refaz **só a análise que deu não ok** (ex.: só B.L) ou todas do frasco?
- [ ] A repetição é em triplicata e com os mesmos prazos da análise original?
- [ ] Como o resultado da repetição fecha o desvio (confirmou / não confirmou, como no desvio de drop)?
- [x] Termos: o registro é um **desvio** (de drop ou de tanque); no desvio de tanque, a análise refeita com o frasco de arquivo é a **repetição** (decidido em 07/10/2026; nunca "reanálise").

## Plano de implementação (depois de `v1.0`)

1. `NFC-001` Migration 016 (tabelas, view, limites de exemplo) + arquivo de limites fora do Git.
2. `NFC-002` Regex dos comandos de placa + testes em `tests/interpretar-comando.test.js`.
3. `NFC-003` Gravação com "sim" e cálculo de ok / não ok.
4. `NFC-004` `leitura do dia finalizada` preenchendo "<1".
5. `NFC-005` Relatório com ✅ / 🚨 por tanque.
6. `NFC-006` Desvio de tanque (B.L e WORT) com a repetição pelo frasco de arquivo; página Desvios mostrando também os de tanque.
7. `NFC-007` IA: catálogo com os comandos novos (texto e áudio).
8. `NFC-008` Painel: Situação, tendência e páginas Análise TT / Análise T.N.
