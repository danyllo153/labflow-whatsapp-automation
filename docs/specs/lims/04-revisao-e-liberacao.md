---
title: LabFlow LIMS — Revisão, invalidação e liberação
tags: [labflow, lims, spec, qualidade]
status: draft
version: v0.2
created: 2026-10-07
updated: 2026-10-12
---

# Revisão, invalidação e liberação de resultados

**Navegação:** [Índice](index.md) · Anterior: [Especificações](03-especificacoes.md) · Próximo: [Banco e migrations](05-banco-e-migrations.md)

> v0.2: acrescenta a **invalidação** (corrigir sem sobrescrever) e a regra de segunda pessoa, a partir do estudo de LIMS. Depende de [02 Audit trail](02-audit-trail.md) e [03 Especificações](03-especificacoes.md).

## Direção

**Decisão de 12/10:** a revisão existe **só para resultado ruim**. O analista sabe o que está bom, então resultado `ok` não passa por ninguém: é **liberado automaticamente** na hora de lançar (o registro continua na auditoria). Resultado `nao_ok` (ou sem especificação) fica `lancado` e **só é liberado por outra pessoa**, diferente de quem lançou. Errou? O resultado é **invalidado** e outro é lançado no lugar, ligado ao primeiro: nunca se sobrescreve.

## Estados

```
ok            lancado --(automático, no mesmo instante)--> liberado
nao_ok        lancado --revisar e liberar (outra pessoa)--> liberado
                 |
                 +--recusar (com motivo)--> recusado --> analista lança de novo
liberado --invalidar (com motivo)--> invalidado
```

Não existe estado "revisado" separado: para o resultado ruim, **revisar e liberar são um passo só** (a pessoa que revisa decide liberar ou recusar).

## Regras

| # | Regra |
|---|---|
| R1 | O resultado novo nasce `lancado`; se o veredito for `ok`, passa a `liberado` na mesma transação (`liberado_por` = o sistema, `liberacao_automatica = true`) |
| R2 | Num resultado que exige revisão, quem lançou **não pode** liberá-lo (o banco confere: `liberado_por <> lancado_por`) |
| R3 | **Recusar** exige motivo; o resultado volta ao analista e o histórico fica na auditoria |
| R4 | **Corrigir** um resultado já lançado = invalidar o antigo (motivo obrigatório) e criar um novo com `substitui_id` apontando para ele. O antigo continua no banco, marcado `invalidado` |
| R5 | Só existe **um resultado vigente** (não invalidado) por lote/amostra/análise: o banco recusa dois |
| R6 | **Só exige revisão** o resultado `nao_ok` (da especificação, doc 03) e o `sem_especificacao` (sem veredito, não dá para liberar sozinho). O `ok` nunca vai para a fila |
| R7 | Mudou o estado, vai para a `auditoria` (quem, quando, motivo) |
| R8 | Relatório do dia e painel mostram só `vigentes`; um filtro mostra o que ainda **não foi liberado** |
| R9 | Quem revisa/libera precisa de permissão: **Recomendo** um cargo novo `Revisor` (Admin também pode); o Operador lança, o Consultor só consulta |
| R10 | Resultado `nao_ok` aberto gera **registro de fora de especificação**: causa, ação e decisão, preenchido por quem revisa (começo simples: texto livre) |

## Como fica no WhatsApp

Comandos novos (nomes a fechar): `resultados para revisar` (só os ruins pendentes), `liberar resultado #N`, `recusar resultado #N motivo ...`, `corrigir ct load 77001 lote 4 deu 20 motivo ...`. Todos pedem "sim", como os demais. O comando de **registrar** continua igual; só o estado inicial muda para `lancado`.

## Impacto no que já existe

- O comando de registro de C.T/B.L hoje **corrige** sobrescrevendo ("um resultado repetido corrige o anterior"). Com R4, passa a invalidar e criar novo, com motivo. É uma mudança de comportamento: avisar os usuários.
- Relatório diário: coluna/linha de pendente de liberação.

## Perguntas ainda abertas (travam a v1.0)

- [x] ~~Todo resultado precisa de revisão?~~ **Decidido (12/10): só o ruim.** Revisar e liberar são um passo só.
- [ ] Cargo `Revisor` novo ou papel do Admin? (Com tão pouco volume de resultados ruins, **Recomendo** começar com Admin e Operador podendo liberar o que **outra** pessoa lançou, sem cargo novo.)
- [ ] Prazo para liberar e alerta se ficar parado? (Um resultado ruim parado é o mais urgente: **Recomendo** alerta no relatório do dia e no `leitura do dia finalizada`.)
- [ ] O `sem_especificacao` realmente deve ir para revisão, ou liberar com aviso? (Recomendo revisar, para não liberar sem limite.)
- [ ] O que é "lote liberado" para a empresa: um resultado, todos os testes do load, ou só os obrigatórios?

## Pronto quando

R1 a R10 passam em teste de migration e em teste do node de interpretação; um resultado `ok` aparece `liberado` na hora, sem fila; um `nao_ok` fica pendente e só outra pessoa o libera; um C.T corrigido pelo WhatsApp mantém o valor antigo como `invalidado` com motivo.
