---
name: bom-dia
description: Resumo de retomada do LabFlow - o que foi feito por último (em qualquer aparelho - PC, notebook ou nuvem) e quais são os próximos passos. Usar quando o Danyllo disser "bom dia", "boa tarde", "boa noite", "onde paramos", "o que fizemos", "resumo" ou "o que falta". Só lê; não muda nada.
---

# Bom dia / Boa tarde / Boa noite (LabFlow)

Objetivo: em poucas linhas, o Danyllo sabe **o que foi feito por último** (por qualquer sessão: PC, notebook ou nuvem) e **o que vem a seguir**. É o par da skill `fechar-dia`: ela escreve o handoff; esta lê. Responder em português, curto, sem enrolação.

**Esta skill só lê.** Não troca de branch, não faz pull, stash nem commit na pasta principal (`C:\Dev\labflow-whatsapp-automation` pode estar em uso por outra sessão), não mescla nem publica nada.

## 1. Saudação
Pela hora de Brasília (`TZ=UTC+3 date "+%H:%M %d/%m"`; no Git Bash do Windows `TZ=America/Sao_Paulo` é ignorado e mostra a hora UTC, 3 h adiantada): até 11:59 "Bom dia", até 17:59 "Boa tarde", depois "Boa noite" (se ele cumprimentou de outro jeito, responda no mesmo tom).

## 2. Levantar (só leitura)
1. `git fetch -q --prune` e ler da `main` remota, sem mexer na pasta: `MSYS_NO_PATHCONV=1 git show origin/main:docs/handoff.md` (no Git Bash do Windows o `MSYS_NO_PATHCONV=1` evita que o caminho seja estragado). A **seção 0** é a fonte principal: os blocos do topo são os mais recentes; o bloco do app começa com "sessão do APP".
2. O que entrou desde a última vez: `git log --since="36 hours ago" --format="%h %ci %an %s" origin/main`. O autor `danyllo` (minúsculo) é o notebook; `Danyllo Gomes` é o PC ou a nuvem pelo GitHub.
3. O que está em andamento: `gh pr list --state open --json number,title,isDraft,updatedAt,files`. **Rascunho (draft) = trabalho em andamento de alguma sessão.** PR do bot é o que mexe em `LabFlow.json`, `tests/` ou `db/migrations/0[2-4]*`; do app, o que mexe em `app/` ou `docs/specs/lims/`.
4. O próximo combinado: o "▶ Próximos passos" de `docs/backlog.md` (`MSYS_NO_PATHCONV=1 git show origin/main:docs/backlog.md | sed -n '/▶ Próximos/,/^## /p'`). **Não ler** o `docs/handoff-historico.md` nem o Obsidian: gasta token, e o estado está no handoff e no backlog.
5. Opcional, se a conversa for sobre o bot no ar: o último backup no servidor (`ssh labflow 'ls -t ~/labflow/backups-n8n | head -1'`) diz qual foi a última publicação. Se o SSH não responder, seguir sem.

## 3. Responder neste formato
```
<Saudação>, Danyllo!

**O que fizemos por último**
- <data>: <o que mudou, com o nº do PR e onde (PC, notebook, nuvem)>   (3 a 6 itens, do mais recente para o mais antigo)

**No ar agora:** <workflow/versão e último backup, se souber>   (uma linha; omitir se não souber)

**Em andamento**
- #<PR> (rascunho): <o que é e o que falta>   (omitir a seção se não houver)

**Próximos passos**
1. <o mais importante, com a recomendação>
2. ...
(3 a 5 itens; o que depende de decisão ou de material dele, como uma foto ou uma resposta, vai marcado "precisa de você")
```
- Linguagem simples, sem jargão de Git quando der ("está no ar", "falta testar").
- Nada de dado confidencial (telefone, IP, chave, limite real).
- Se o handoff estiver atrasado em relação ao `git log` ou aos PRs, dizer isso numa linha e confiar no `git log`/PRs.
- Terminar perguntando por qual passo ele quer começar.
