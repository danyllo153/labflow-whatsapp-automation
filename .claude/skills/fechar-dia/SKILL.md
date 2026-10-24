---
name: fechar-dia
description: Encerra a sessão do LabFlow deixando tudo atualizado para continuar em outro computador (desktop, notebook ou nuvem) - só o repositório (handoff, backlog, CHANGELOG), commit, PR e o roteiro para o Danyllo. Não mexe no Obsidian. Usar quando ele pedir "fechar o dia", "finalizar dia", "encerrar a sessão", "atualize o handoff" ou "vou continuar no notebook".
---

# Fechar o dia (LabFlow)

Objetivo: o Danyllo fecha esta sessão e, em outro aparelho, só faz `git pull` e abre o Claude Code, que lê o `CLAUDE.md` e o `docs/handoff.md` e continua de onde parou. Responder em português, passos curtos.

**Regra de 24/10/2026: o repositório é a única fonte do estado e dos planos.** O fim do dia **não atualiza o Obsidian** (escrever a mesma coisa em dois lugares gastava token à toa). O vault só muda quando o Danyllo pedir, uma nota por vez, ou quando uma decisão tem dado confidencial (aí vai só para o `decisoes-log` do vault).

## 1. Levantar o que aconteceu hoje
- `git fetch -q`, `git status -sb`, `git log --oneline origin/main..HEAD` e `gh pr list --state open`.
- Ler só a **seção 0** do `docs/handoff.md` e o "▶ Próximos passos" do `docs/backlog.md`. **Não ler** o `docs/handoff-historico.md`.

## 2. Atualizar o repositório (worktree próprio, nunca a pasta principal se outra sessão a usa)
- **`docs/handoff.md`, seção 0:** a sessão tem **um bloco só** (o do app começa com "sessão do APP"; não mexer no bloco da outra sessão). Reescrever o próprio bloco com a data de hoje (`TZ=UTC+3 date`): o que está no ar (workflow, nº de nós, último backup, última migration), o que foi feito hoje (com os PRs), o que ficou pela metade e o **próximo passo exato**. Curto: um parágrafo. O bloco antigo vai para o **topo** do `docs/handoff-historico.md` (abaixo do título da seção), sem reler o histórico inteiro.
- **`docs/backlog.md`:** marcar `[x]` no que foi feito (com data e PR), acrescentar o que surgiu e deixar o **▶ próximo** certo. É o único lugar do "próximo".
- **`docs/CHANGELOG.md`, `[Não lançado]`:** uma linha por mudança visível que ainda não estiver lá.
- Comando novo: `docs/comandos.md`. Bug novo: `docs/troubleshooting.md`.
- Nunca colocar dado confidencial (limites reais, clientes, IP do servidor, telefones, chaves, IDs reais do n8n além do workflow já documentado).

## 3. Conferir e commitar
- Arquivo gerado por script: procurar `Ã`, `Â`, `�`.
- Mexeu no workflow: `py scripts/audit-workflow.py LabFlow.json --public` (0 erros) e `npm test`.
- Branch própria (nunca direto na `main`), Conventional Commits em português, **sem** `Co-Authored-By` nem rodapé de ferramenta. Docs do fim do dia: `docs(handoff): onde paramos em dd/mm`, branch `docs/fechar-dia-ddmm`.
- Push e PR (`gh pr create`). Docs só de handoff/backlog podem ser mesclados logo (`gh pr merge --squash --delete-branch`), para o outro aparelho pegar no `git pull`. Código: mesclar só quando o Danyllo pedir.

## 4. Arquivos fora do Git (avisar, nunca commitar)
- `LabFlow_importar_n8n*.json` (IDs reais) e o arquivo real de limites de NFC não sobem para o GitHub.
- `.mcp.json` e a configuração de SSH (`~/.ssh/config`, chave) são de cada máquina.

## 5. Resposta final
Curta: o que foi atualizado no repositório (com o nº do PR), o que ficou fora do Git e o próximo passo que está no handoff. No outro aparelho basta `git pull` na `main` e pedir "bom dia".
