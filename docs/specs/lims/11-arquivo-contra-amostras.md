---
title: LabFlow LIMS — Arquivo de contra-amostras (caixas, bags e descarte)
tags: [labflow, lims, spec, arquivo, contra-amostra]
status: draft
version: v0.1
created: 2026-10-25
---

# Arquivo de contra-amostras (caixas, bags e descarte)

**Navegação:** [Índice](index.md) · [Rumo do app](rumo-do-app.md) · Pedido ao bot: **PB21**

> Pedido do Danyllo de 25/10/2026. Hoje o arquivo é uma planilha (uma aba por tipo) e três laudos de papel, quase tudo
> sem preencher. A ideia: **o registro que o analista já faz (coleta, recebimento, embarque) já arquiva a amostra** numa
> caixa, o laudo da caixa se monta sozinho e qualquer um consulta **o que já pode ser descartado**.
>
> Os documentos da empresa (planilha e modelos dos laudos) **não vão para o Git**: esta nota descreve as regras com
> palavras próprias e números **fictícios**. O cadastro real das caixas (faixas por navio) é carregado por arquivo fora
> do Git, como os limites.

## 1. Os três arquivos

| Arquivo | O que vai na caixa | Como a caixa é escolhida | Prazo para descarte |
|---|---|---|---|
| **Tanque terra (bags de NFC)** | Um bag por coleta do tanque | **Uma caixa por tanque, com o mesmo número** (tanque 39 = caixa 39) | **1 ano** depois da coleta (o bot já calcula: `data de arquivamento do bag`) |
| **Navio (embarque)** | As amostras do embarque, **por load**: FCOJ (as amostras A1..An da linha e fase) e NFC dos tanques do navio (**um pote por tanque**) | **Uma caixa por navio e viagem**, dentro da **faixa de caixas da família do navio** (ex. fictício: O.ALFA 1–20, O.BETA 21–40...) | **1 ano**; se a caixa tiver **concentrado (FCOJ)**, a **caixa inteira vale 2 anos** |
| **Recebimento de FCOJ** | Os lotes de cada load, por load | **Caixas 121 a 153**; a caixa vem da **foto** da folha ou o analista digita no app/site | **7 dias** depois de arquivado |

## 2. Regras

- **Caixa vazia e disponível:** a caixa nasce cadastrada e vazia (como a planilha). Fica **em uso** quando recebe a
  primeira amostra e volta a **disponível** quando tudo dela é **descartado** (registro de descarte, com quem e quando).
- **Tanque terra:** no dia da coleta, o bag já entra na caixa do tanque, com a data da coleta e a data para descarte.
  Nada para o analista digitar além da coleta que ele já registra.
- **Navio:** no primeiro registro do navio e viagem (coleta de tanque de navio ou embarque de FCOJ), o sistema **reserva
  a próxima caixa disponível da família** e tudo daquele navio e viagem entra nela (**a viagem cabe sempre numa caixa só**).
  Cada tanque de NFC do navio é **um pote** (uma linha de 1 amostra). Cada linha do laudo é um load: número
  do load (ou `43001/43002` quando a linha e fase junta loads), quantidade de amostras e a data de descarte.
  - O laudo **mostra a data de cada linha**: 1 ano para NFC, 2 anos para FCOJ; a **caixa** só fica disponível na maior
    data (2 anos, se tiver FCOJ).
- **Recebimento:** a caixa (**121 a 153**) é lida na **foto** da folha do recebimento (o número da caixa está nela) e
  ligada às amostras daquela foto; sem foto, o analista **digita o número da caixa** no app ou no site (ou no comando). Cada linha do laudo: load, lotes (`12-24, 27`) e a data para descarte (arquivado + 7 dias).
  Uma caixa recebe vários dias até encher; o próximo número é sugerido.
- **Descarte:** a consulta "o que posso descartar hoje" junta os três arquivos (caixa, o que tem dentro, desde quando).
  Descartar pede **um sim** com a lista; quem descartou fica registrado. Nada é apagado: o item fica como descartado.
- **Laudos** (um por caixa, gerados sozinhos a partir do banco, como os outros laudos do app):
  - **Embarque:** Número da caixa · Números dos loads · Quantidade de amostra · Liberada para descarte.
  - **Recebimento:** Número da caixa · Número do load · Números dos lotes · Liberada para descarte.
  - **Bags de tanque terra:** Caixa (tanque) · Data da coleta · Data para descarte.
  - Rodapé à mão: Analista e Responsável pela correta aplicação (Nome, Visto, Data).

## 3. Exemplo (fictício)

```
Navio O.BETA 205 → caixa 27 (família O.BETA: 21–40)
  load 90101/90102   5 amostras (FCOJ)   descarte 25/10/2028
  load 90110         1 amostra  (NFC)    descarte 25/10/2027
  → caixa 27 disponível a partir de 25/10/2028

Recebimento → caixa 136
  load 90200   lotes 1-12, 14   arquivado 25/10/2026   descarte 01/11/2026
```

## 4. Comandos (proposta; a sessão do bot decide a forma final)

```
recebimento ... caixa 136                     a caixa junto do registro do recebimento
arquivei load 90200 lotes 1-12,14 caixa 136   arquivar depois (recebimento)
qual caixa do navio O.BETA 205?               a caixa do navio e o que tem dentro
caixas disponíveis O.BETA                     as caixas vazias da família
o que posso descartar hoje?                   os três arquivos (bags, navio, recebimento)
descartei caixa 136                           pede sim com a lista; libera a caixa
descartei bags do tanque 35 até 25/10/2025    bags vencidos de um tanque
```

No app: página **Arquivo** (caixas por tipo, em uso / disponíveis / para descartar), o campo **Caixa** no registro do
recebimento, os **laudos** por caixa (PDF) e o descarte com a prévia e um Confirmar.

## 5. Respondido pelo Danyllo (25/10/2026)

1. No navio, a linha de **1 amostra** é o **pote de um tanque de NFC** do navio (um pote por tanque).
2. A **viagem cabe sempre numa caixa só**.
3. Tanque terra: **a caixa tem o número do tanque** (tanque 39 = caixa 39).
4. Descarte: **Admin e Analista**.
5. **O que já está preenchido na planilha entra no banco** (carga inicial por arquivo fora do Git, como os limites).
6. Recebimento: caixas **121 a 153**; a caixa vem da **foto** (o número está na folha) ou é **digitada** no app/site.
7. (25/10, depois de ver a planilha) Tanques terra de **34 a 49**. O que já venceu na planilha **já foi descartado** (entra como descartado); o recebimento começa vazio, sugerindo a **121**. **Sem aviso para ninguém:** cada um consulta no bot ou na página Arquivo, onde o vencido fica **em vermelho** como pendência de descarte. Nomes dos navios no padrão do bot (`O.SKY 189`, viagem sem zero à esquerda).

## 6. Feito no banco e no bot (migration 105, 25/10/2026)

Tabelas `arquivo_familias`, `arquivo_caixas`, `arquivo_navios` (a caixa de cada navio e viagem, reservada por gatilho quando o navio é cadastrado) e `arquivo_recebimento`; os bags e potes continuam na `arquivo_amostras` do bot. Views `vw_arquivo_itens` e `vw_arquivo_caixas`, funções `arquivo_arquivar_recebimento` e `arquivo_descartar` (app e bot) e os comandos da seção 20 do [`comandos.md`](../../comandos.md). A carga inicial (famílias, faixas e as viagens da planilha) é um arquivo fora do Git. Próximo: a caixa do recebimento lida pela foto.


> **26/10/2026:** o recebimento vai da caixa **121 à 153** (conferido pelo Danyllo; pedido PB23 ao bot). A caixa do recebimento só vai para descarte quando **todos** os loads dela venceram (o app não avisa load vencido sozinho).

> **01/11/2026 (PB24, migration 109):** caixa de navio ganhou **data inicial**: a última amostra do navio e viagem (coleta de tanque ou amostra do embarque) mais 5 dias, ou a data escolhida à mão por Admin e Analista. O pote conta 1 ano e o FCOJ 2 anos **dessa data**, não mais da coleta e do embarque; a caixa continua liberando na maior. A linha da carga inicial mantém a data da planilha, porque ela não diz se é pote ou FCOJ.
