---
name: fechar-dia
description: Encerra a sessão do LabFlow deixando tudo atualizado para continuar em outro computador (desktop ou notebook) - handoff, decisoes-log, backlog, CHANGELOG, cópia das specs para o vault, commits e o roteiro de push/PR/merge para o Danyllo. Usar quando ele pedir "fechar o dia", "encerrar a sessão", "atualize tudo" ou "vou continuar no desktop".
---

# Fechar o dia (LabFlow)

Objetivo: o Danyllo fecha esta sessão e, em outro computador, só faz `git pull` e abre o Claude Code, que lê o `CLAUDE.md` e o `docs/handoff.md` e continua de onde parou. Responder em português, passos curtos, um comando por vez.

## 1. Levantar o que aconteceu hoje
- `git status -sb`, `git log --oneline origin/main..HEAD` e `git branch --no-merged main` (inclusive branches locais nunca enviadas).
- PRs abertos: `gh pr list` (no PowerShell, se o `gh` não for achado, recarregar o PATH da máquina e do usuário).
- Ler a seção 0 do `docs/handoff.md` e o topo do `[Não lançado]` em `docs/CHANGELOG.md`.

## 2. Atualizar o repositório
- `docs/handoff.md`, seção 0 "Onde paramos": um parágrafo com a data de hoje (`America/Sao_Paulo`) dizendo o que foi feito (com os números dos PRs), o que ficou pela metade e o **próximo passo exato**. Apagar ou marcar como feitos os itens antigos que já foram resolvidos. Atualizar a seção 2 se mudou o estado do servidor (migrations aplicadas, dados de demonstração).
- `docs/CHANGELOG.md`, `[Não lançado]`: uma linha por mudança visível que ainda não estiver lá.
- Comando novo: conferir `docs/comandos.md`. Bug novo: conferir `docs/troubleshooting.md`.
- Nunca colocar dado confidencial (limites reais, clientes, IP do servidor, telefones, IDs do n8n).

## 3. Atualizar o vault do Obsidian
Pasta: `C:\Users\danil\OneDrive\Valts\PROJETO- LABFLOW\LABFLOW` (no outro computador o OneDrive sincroniza sozinho).
- `01-Decisoes/decisoes-log.md`: uma entrada com a data de hoje para cada decisão do dia (o quê e por quê). Os limites reais só podem ficar aqui.
- `03-Backlog/backlog.md`: marcar `[x]` no que foi feito (com data e PR), acrescentar o que surgiu e deixar o **▶ próximo** certo. É o único lugar do "próximo" no vault.
- Comando novo: a cheatsheet `Comandos-Disponiveis`. Servidor ou banco: `00-Servidores` e `Postgres-Migracao`.
- As specs (`docs/specs/lims/`) vão para `05-Specs-LIMS` pelo `C:\Dev\sync-valts.bat`. Pedir ao Danyllo que rode, ou rodar com `cmd /c C:\Dev\sync-valts.bat`. A cópia do vault não se edita.

## 4. Conferir e commitar
- Arquivo gerado por script: procurar `Ã`, `Â`, `�`.
- Mexeu no workflow: `py scripts/audit-workflow.py LabFlow.json --public` (0 erros) e `npm test`.
- Commit local na branch da mudança (nunca direto na `main`), Conventional Commits em português, **sem** `Co-Authored-By` nem rodapé de ferramenta. Docs do fim do dia: `docs(handoff): onde paramos em dd/mm`.
- Se a `main` estiver atualizada e não houver branch aberta, criar `docs/fechar-dia-ddmm`.

## 5. Arquivos fora do Git (avisar, nunca commitar)
- `LabFlow_importar_n8n*.json` (IDs reais) e o arquivo real de limites de NFC não sobem para o GitHub. Se mudaram hoje e ele vai trabalhar no outro computador, lembrar de copiar (pendrive ou OneDrive pessoal, fora do repositório) ou de exportar de novo do n8n lá.
- `.mcp.json` e a configuração de SSH (`~/.ssh/config`, chave) são de cada máquina.

## 6. Roteiro para o Danyllo (push, PR e merge são dele)
Mandar um comando por bloco, nesta ordem, lembrando que o PowerShell tem de estar na pasta do projeto:
```
cd C:\Dev\labflow-whatsapp-automation
git push -u origin <branch>
gh pr create --base main --fill
gh pr merge --merge --delete-branch
git switch main
git pull
```
E no outro computador:
```
cd C:\Dev\labflow-whatsapp-automation
git switch main
git pull
```
Depois ele abre o Claude Code na pasta e pede "leia o handoff e continue".

## 7. Resposta final
Resumo curto: o que foi atualizado (repositório e vault), o que ficou fora do Git e o próximo passo que está no handoff.
