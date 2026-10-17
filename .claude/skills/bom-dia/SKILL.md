---
name: bom-dia
description: Saudação de retomada do LabFlow - responde ao "bom dia", "boa tarde" ou "boa noite" do Danyllo com o que foi feito por último e os próximos passos, lidos do repositório (handoff, rumo do app, PRs abertos). Usar quando ele cumprimentar assim ao começar ou voltar a uma sessão, ou pedir "onde paramos" / "o que temos para hoje".
---

# Bom dia / boa tarde / boa noite (LabFlow)

Objetivo: quando o Danyllo cumprimenta, ele quer saber em 1 minuto **onde paramos** e **o que vem agora**, sem precisar ler o handoff. Responder em português, curto, com o mesmo cumprimento que ele usou ("Bom dia!", "Boa tarde!", "Boa noite!"). Se ele não usou nenhum, escolher pelo horário de `America/Sao_Paulo` (5h–12h bom dia, 12h–18h boa tarde, 18h–5h boa noite).

## 1. Atualizar antes de responder (só leitura)
- `git fetch origin` e `git switch main && git pull` (se houver mudança local não enviada, **não** trocar de branch: avisar e ler a `main` com `git show origin/main:<arquivo>`).
- Ler a **seção 0** do `docs/handoff.md` (os blocos do bot e da sessão do APP).
- Ler `docs/specs/lims/rumo-do-app.md`: "Fase atual", "Tarefas da Fase B" (linha de andamento), "Pedidos para a sessão do bot" e "Decisões em aberto".
- PRs abertos: `gh pr list --state open` (se o `gh` falhar com GraphQL, usar `gh api "repos/danyllo153/labflow-whatsapp-automation/pulls?state=open"`), com título e se é rascunho.
- Últimos commits da `main`: `git log --oneline -8 origin/main`.

## 2. Responder neste formato
```
<Cumprimento>, Danyllo!

**Por último fizemos** (data):
- 3 a 5 itens, os mais recentes primeiro, com o número do PR entre parênteses.

**Esperando você:**
- PRs abertos que precisam de "mescle" (número e uma linha cada).
- Decisões ou informações pendentes (ex.: domínio, perguntas abertas no rumo).

**Próximos passos:**
1. O próximo passo exato do handoff/rumo (ex.: "APP-010: pendências de hoje").
2. O seguinte.
3. O que depende da sessão do bot (PB1, PB4, PB5, PB6) ou do servidor.

Por onde quer começar?
```

## Regras
- Só o que está escrito no repositório e no GitHub; nada inventado. Se o handoff e o GitHub discordarem (ex.: PR já mesclado mas o handoff diz aberto), dizer qual é o certo e oferecer corrigir o handoff.
- Separar o que é do **app** e o que é do **bot** quando os dois tiverem novidade.
- Não executar nada além da leitura: mesclar, publicar ou começar tarefa só depois que ele escolher.
- Sem dado confidencial (IP, telefones, IDs do n8n, limites reais).
