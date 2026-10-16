---
title: LabFlow LIMS — Fluxos
tags: [labflow, lims, spec, fluxos]
status: draft
version: v0.2
created: 2026-10-07
updated: 2026-10-15
---

# Fluxos

**Navegação:** [Índice](index.md) · Anterior: [App (PWA)](07-app-pwa.md) · Próximo: [Pontos de atenção](09-pontos-de-atencao.md) · Bússola: [Rumo do app](rumo-do-app.md)

> v0.2 (15/10/2026): escreve os fluxos do app a partir das decisões de 15/10 ([07](07-app-pwa.md), [06](06-api-e-auth.md), [rumo](rumo-do-app.md)). O fluxo do **assistente** (seção A4) tem uma pergunta aberta. Os fluxos de revisão e liberação e de especificação continuam com a Fase 1 do LIMS ([03](03-especificacoes.md), [04](04-revisao-e-liberacao.md)).

## Direção

Cada ação tem **um caminho só** até o banco, passando pelo lugar onde as regras são conferidas. No app há três portas de entrada (clique, assistente, foto), mas **todas terminam na mesma função do banco**, a mesma que o bot usa.

```
 Clique (formulário)  ─┐
 Assistente (texto/voz)├─► API (confere login e cargo) ─► função do banco ─► tabelas do bot
 Foto                  ─┘          │                         (regra única)        │
                                   └──► tabelas do app (turno, estufas, esterilização)
 WhatsApp ─► n8n ──────────────────────────────────────► mesma função do banco ──┘
                                                                     │
                                         aviso de mudança ──► páginas abertas se atualizam
```

## Modelo de cada fluxo

```
Gatilho: quem faz o quê, por qual porta
Pré-condições: o que precisa existir e qual cargo
Passos: 1, 2, 3...
O que a pessoa vê antes de gravar
Regras conferidas: na API / no banco
Resultado: o que muda e onde aparece
Erros: o que acontece quando algo falha
```

## A. Fluxos do app

### A1. Primeiro acesso e esqueci a senha
- **Gatilho:** o Admin cadastra uma pessoa ou alguém esqueceu a senha.
- **Pré-condições:** quem gera é Admin; a pessoa existe em `usuarios` (ou é cadastrada agora, pela função do PB5).
- **Passos:** 1) Admin → Pessoas → "Nova pessoa" (ou a pessoa da lista) → "Gerar senha provisória". 2) O app mostra a senha aleatória (24 h). 3) A pessoa entra com usuário e senha provisória. 4) O app obriga a criar a senha própria. 5) Entra no app.
- **Regras:** só Admin gera; a senha provisória vale uma vez e por 24 h; a nova senha não pode ser igual ao usuário; 5 erros seguidos bloqueiam por 15 min (API).
- **Resultado:** `app.credenciais` com a senha nova em hash; a provisória marcada como usada; a anterior deixa de valer.
- **Erros:** provisória vencida ou já usada → "Peça uma nova senha provisória ao Admin".

### A2. Entrar no turno e sair
- **Gatilho:** a pessoa abre o app no começo do turno.
- **Passos:** 1) O app sugere o turno pelo horário. 2) A pessoa confirma ou troca e **ajusta o horário** de entrada e saída. 3) "Entrar". Ao ir embora: "Sair do turno".
- **Regras:** uma entrada aberta por pessoa; Consultor não entra em turno.
- **Resultado:** `app.entradas_turno`; tudo o que ela gravar enquanto estiver no turno fica ligado a ele.
- **Erros:** esqueceu de sair → a entrada fecha sozinha quando o turno se encerra.

### A3. Registrar ou corrigir pelo clique
- **Gatilho:** a pessoa toca em "Fazer" (Início), "Editar" (detalhe de uma linha) ou num formulário.
- **Pré-condições:** cargo com permissão ([07](07-app-pwa.md), Permissões); a função do banco daquela ação existe (pedido PB4; ordem: Coletas e Recebimento primeiro).
- **Passos:** 1) O formulário abre já preenchido. 2) A pessoa muda o que precisa (e escreve o **motivo**, na correção). 3) "Salvar". 4) O app mostra **"antes → depois"** e pede **Confirmar**. 5) A API chama a função do banco.
- **Regras:** API confere login e cargo; a **função do banco** confere as regras do laboratório (as mesmas do bot) e grava quem, quando e o motivo.
- **Resultado:** registro gravado; a página se atualiza para todos; aparece com o nome de quem fez.
- **Erros:** a função recusa (ex.: coleta duplicada) → a mensagem da regra aparece em português simples, nada é gravado.

### A4. Assistente (texto e voz)
- **Gatilho:** a pessoa toca no botão Assistente e escreve ou fala ("coletei os tanques 41 e 42"); ou toca em "Corrigir com o assistente" numa linha (o assistente recebe qual registro é).
- **Passos:** 1) Voz: o áudio vira texto (como no bot; áudio não é guardado). 2) O texto segue o **mesmo pipeline do bot** (regex → IA → validação no código). 3) O assistente responde com o que entendeu e **um botão Sim / Não** (uma mensagem, um sim para a lista inteira). 4) Sim → grava, em fila, pela mesma regra do bot. 5) Resposta com o link para a página ("6 leituras marcadas. Ver em Tanques").
- **Regras:** permissão no código (nunca no prompt); limite diário de IA por pessoa, somado com o WhatsApp; tudo que grava pede sim.
- **Resultado:** igual ao comando do WhatsApp; a página se atualiza.
- **Como chega ao pipeline do bot:** decidido em 15/10 (seção "Assistente e o pipeline do bot", abaixo; pedido PB6).

### A5. Foto de laudo
- **Gatilho:** a pessoa toca em Foto no assistente e fotografa o laudo.
- **Passos e regras:** o mesmo fluxo de [foto-laudo](../foto-laudo.md): a IA lê, o código valida, o app mostra **a lista** do que leu e o que ficou em dúvida, **um sim** para tudo. Valor riscado não vale; nunca cria composta nem abre desvio sozinho (lista os não ok com o botão pronto).
- **Resultado:** leituras gravadas; a página de leituras se atualiza. A foto não é guardada.

### A6. Excluir
- **Gatilho:** "Excluir" no detalhe de uma linha (Admin e Operador; Coletor pede ao Admin).
- **Passos:** 1) O app mostra o que será excluído. 2) Pede o **motivo** (obrigatório). 3) Confirmar.
- **Regras:** função do banco; **não apaga**: marca como excluído com quem, quando e motivo.
- **Resultado:** some das páginas e das contas; o Admin vê em Histórico e pode **recuperar** (função do banco, com motivo).

### A7. Conferir as estufas
- **Gatilho:** início do turno; aba Estufas ou bloco no fim do Início.
- **Passos:** para cada estufa, nas **duas leituras** (supervisório e field chart), **Ok** ou **Não ok**; no Não ok, digitar a **temperatura** daquela leitura (obrigatória) e uma observação opcional. A estufa fica Não ok se qualquer leitura estiver Não ok; a diferença aparece quando as duas temperaturas foram digitadas (decidido em 16/10).
- **Resultado:** `app.leituras_estufa` com quem, quando e turno; estufa não conferida fica **Pendente**; Não ok entra nas ocorrências do relatório do turno.

### A8. Esterilização
- **Passos:** tocar no tipo (Ponteira, Meio, Frasco, Descarte, Outro) → **número do ciclo** (obrigatório) e meio (opcional) → Registrar.
- **Resultado:** `app.esterilizacoes`; aparece em "Esterilizações realizadas" do relatório do turno e no gráfico G4.

### A9. Atividades fixas e pendências herdadas
- **Passos:** marcar a caixa **Feito**. Item escrito à mão: grava quem e quando. Item automático (ex.: uma leitura): abre a confirmação do registro (fluxo A3 ou A4).
- **Resultado:** `app.atividades_feitas`; some de "Para fazer agora" e entra em "Análises feitas".

### A10. Encerrar o turno
- **Gatilho:** a última pessoa do turno toca em "Encerrar turno".
- **Passos:** 1) O app mostra o que passa adiante ("Ficam para a Tarde: 3 leituras, 1 desvio aberto, 2 recados"). 2) Confirmar.
- **Regras:** encerrado = só leitura; só o Admin reabre, com motivo. Se ninguém encerrar, encerra sozinho quando o próximo turno começa.
- **Resultado:** `app.relatorios_turno` encerrado; as pendências aparecem como "herdadas" no próximo turno.

### A11. Filtrar, imprimir e exportar
- **Passos:** escolher filtros (período, load, lote, tanque, navio, fábrica, usuário, situação) → **Imprimir** (A4 em pé ou deitado, à escolha) ou **Exportar Excel**.
- **Resultado:** só o que está filtrado; no topo, título, filtros e data; sem emoji.
- **Regra (decidida em 15/10):** **todos os cargos** que veem a página podem imprimir e exportar, **inclusive o Consultor**; impressão e exportação são **livres, sem registro** de quem fez.

## B. Fluxos do LIMS (Fase 1, continuam em aberto)

- [ ] **Lançar resultado** com estado `lancado` ([04](04-revisao-e-liberacao.md))
- [ ] **Revisar e liberar** (fila → outra pessoa → liberado/recusado)
- [ ] **Cadastrar especificação** ([03](03-especificacoes.md))

## Perguntas

- [x] ~~A4 — como o assistente do app chega ao pipeline do bot?~~ **Mesmo webhook do n8n com `canal: app`** (15/10, pedido PB6).
- [x] ~~A11 — o Consultor pode exportar para Excel?~~ **Sim, e sem registro de quem imprimiu ou exportou** (15/10).

### Assistente e o pipeline do bot (decidido em 15/10)

O bot hoje recebe as mensagens do WhatsApp pela Evolution, num webhook do n8n, e responde chamando a Evolution de volta. Para o app usar **o mesmo pipeline sem duplicar regras**:

1. A API manda a mensagem do app ao **mesmo webhook do n8n**, no mesmo formato da Evolution, com a marca `canal: app`, o telefone da pessoa logada e um segredo no cabeçalho (ninguém se passa pelo app).
2. O workflow roda **igual**. Na hora de responder, os nodes que hoje chamam a Evolution passam a mandar a resposta para a **API** quando o canal for `app`.
3. A API entrega a resposta na tela do assistente, sem os emojis (etiquetas de texto no lugar).

**O que exige:** uma mudança pequena no workflow (a URL de resposta passa a depender do canal), feita **pela sessão do bot** (pedido PB6). O WhatsApp continua idêntico.

**Cuidados:** a confirmação pendente é **uma por pessoa** no bot, então um "sim" no WhatsApp confirma um pedido feito no app (e vice-versa): o app avisa "você tem uma confirmação pendente". O limite diário de IA é somado entre os dois canais.

## Pronto quando

As perguntas acima estão respondidas, os fluxos A1–A11 batem com o [07](07-app-pwa.md) e o [06](06-api-e-auth.md), e o Danyllo aprova o conjunto (06, 07, 08 e rumo) para a `v1.0`.
