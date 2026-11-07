---
name: revisar-pr
description: Revisão por agentes com contexto zerado ("peixinhos") antes de mesclar um PR do LabFlow - bot (n8n), app (FastAPI + React) e migrations. Usar quando o Danyllo pedir "revisar o PR", "revisar antes de mesclar", "/revisar-pr" ou logo depois de abrir um PR e antes de perguntar se pode aplicar. Só lê e relata; não corrige, não commita, não mescla.
---

# Revisar PR (LabFlow)

Ideia (inspirada no Elephant-Goldfish Model, do Google): quem escreveu o código (o "elefante", esta conversa) tem as mesmas suposições do código e não as enxerga. Subagentes novos, **sem o histórico da conversa**, leem só o diff e as regras e acham o que passou batido. **Não substitui os testes nem o CI**; complementa.

Responder em português, curto. **Esta skill só lê e relata**: não edita arquivo, não commita, não mescla. Quem decide o que corrigir é o Danyllo.

## 1. Preparar o diff

1. `git fetch origin` e escolher a base: `origin/main`.
2. Diff da branch (ou do PR pedido): `git diff origin/main...HEAD` (ou `gh api repos/{owner}/{repo}/pulls/N/files` na nuvem).
3. Listar os arquivos alterados e decidir quais revisores valem (tabela abaixo). Diff só de docs: só o revisor de segurança/LGPD.
4. Gravar o diff em um arquivo no scratchpad; os revisores leem esse arquivo, não a conversa.

## 2. Disparar os revisores (em paralelo, uma mensagem só)

Use a ferramenta `Agent` (tipo `general-purpose`), um por revisor, **todos na mesma resposta**. O prompt de cada um deve ser autossuficiente e conter só: o caminho do diff, o caminho do `CLAUDE.md`, a lista de arquivos e a missão do revisor. **Não** resumir a conversa, **não** explicar a intenção da mudança, **não** dizer o que "já foi testado" (é isso que os torna "peixinhos").

Instrução comum a todos: somente leitura (nada de editar, rodar migration ou mexer no git); ler o diff e os arquivos citados; devolver uma lista de achados com `arquivo:linha`, o problema, um cenário concreto de falha e a gravidade (alta, média, baixa); **sem elogio**, sem enrolação; começar pelo pior; se não achar nada, dizer "sem achados" e o que conferiu; não inventar achado para parecer útil.

| Revisor | Quando | Missão |
|---|---|---|
| **Domínio** | `LabFlow*.json`, `tests/`, `docs/comandos.md`, textos do app | Regras da seção "Domínio e comportamento do bot" do `CLAUDE.md`: sem "reanálise"; drops (D5/D10/D15); "desvio" e "repetição"; TAB e Coliformes no masculino; "hoje" em `America/Sao_Paulo`; poucas mensagens e um só "sim"; nunca abrir desvio sozinho; placa até 99; foto nunca cria composta de embarque nem de TAB. Comando ou regra nova sem caso em `tests/interpretar-comando.test.js` é achado. |
| **Segurança e LGPD** | **sempre** | Dado real de laboratório (resultados, amostras, pessoas, telefones); IDs reais do n8n, chaves, tokens, IP do servidor, `.env`; trecho de documento confidencial ou limites reais de aceitação; `LabFlow.json` público com ID real; SQL montado por concatenação; endpoint sem checagem de permissão; permissão validada no prompt em vez de no código (Bug 23); segredo em log ou mensagem de erro; XSS no front. |
| **n8n e migrations** | `LabFlow*.json`, `db/migrations/`, `db/seeds/`, `scripts/` | Todo ramo termina em `Respond to Webhook`; node depois de node com várias linhas usa `executeOnce`; gravação nova entra antes do `Retomar resposta do sim` (Bug 29); número da migration dentro da faixa de quem mexe (bot 027–049 e 100–149; app 050–099) e sem repetir número da `main` ou de PR aberto; migration tem `BEGIN`/`COMMIT`, arquivo de desfazer, não esvazia `usuarios` e não apaga dado sem trava de contagem; limites em tabelas com vigência. |
| **App (back e front)** | `app/api/`, `app/web/` | **Back (FastAPI):** validação de entrada, autenticação e papel em cada rota, transação e rollback, N+1, erro que vaza detalhe interno, teste da rota nova. **Front (React):** estado e efeito (loop, dependência faltando), tratamento de carregando/erro/vazio, formulário que perde dado, acessibilidade básica (rótulo, foco, contraste), tela no celular, texto fora do vocabulário do domínio, chamada à API que não bate com o contrato do back. **Contrato:** mudou campo na API sem mudar o front (ou o contrário). |

## 3. Consolidar

1. Juntar os relatórios, tirar duplicados e **conferir cada achado no código** antes de repassar (revisor de contexto zerado erra; descartar o que não se confirma e dizer quantos foram descartados).
2. Responder ao Danyllo com uma tabela curta: gravidade, `arquivo:linha`, problema, sugestão de correção. Sem achado confirmado: "revisão sem achados" e o que foi conferido.
3. Perguntar quais corrigir. **Só corrigir o que ele aprovar**, em commit novo na mesma branch, e rodar os testes de novo. Depois disso, o fluxo normal do `CLAUDE.md` (CI, depois perguntar se pode aplicar).

## 4. Adaptar para outro projeto

Esta skill é específica do LabFlow. Para um projeto novo, siga `docs/revisao-por-agentes.md` (modelo e passo a passo) em vez de copiar esta tabela.
