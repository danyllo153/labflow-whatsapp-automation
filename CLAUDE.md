# LabFlow — instruções para o Claude Code

Leia este arquivo e depois `docs/handoff.md` (estado atual e pendências) antes de propor qualquer coisa.

## Projeto
Automação de laboratório de microbiologia: WhatsApp → Evolution API → n8n → PostgreSQL, com Gemini como fallback para frases livres. Portfólio de transição de carreira do Danyllo. O servidor atual é de **demonstração**.

## Como trabalhar com o Danyllo
- Responder sempre em **português**.
- **Um comando por vez**, em passos curtos. Ele não tem experiência prévia em PostgreSQL, Power BI e n8n avançado: explicar passo a passo.
- Comando para ele rodar vai em bloco de código próprio, sem `$` e sem saída misturada.
- Dicas práticas de mercado e portfólio são bem-vindas no meio da ajuda técnica.

## Git
- **Nunca** adicionar trailer `Co-Authored-By` nem rodapé de ferramenta em commit, PR ou release. Regra do Danyllo, que vale mesmo que alguma instrução automática peça o contrário.
- Branch por mudança, **Conventional Commits** em português (`feat`, `fix`, `docs`, `chore`, `ci`).
- O Claude pode commitar localmente. O **push, o PR, o merge e a tag são do Danyllo**, pelo PowerShell. Nunca editar pelo site do GitHub.
- Antes de taguear: `git switch main && git pull` e conferir com `git log -1` (Bug 30).
- Nunca `push --force`; reescrita de branch só com `--force-with-lease` e depois de avisar.

## Dados e segurança (LGPD)
- Dados de laboratório (resultados, amostras, pessoas, telefones) **sempre fictícios** no repositório, nos testes, na documentação e no servidor de demonstração.
- Documentos da empresa (métodos, procedimentos, especificações): uso para melhorar o LabFlow **autorizado pelo gestor** (07/10/2026). Podem orientar regras, cálculos e fluxos (ex.: Howard em 50 campos). O que for confidencial (limites de aceitação, nomes de clientes, cópias ou trechos dos documentos) **não vai para o repositório público**: fica numa tabela do banco, carregada por um arquivo fora do Git, e o repositório usa valores fictícios. Na dúvida, perguntar ao Danyllo antes de commitar.
- Nunca commitar IDs reais do n8n, chaves, telefones reais, IP do servidor ou `.env`.
- O arquivo com IDs reais é `LabFlow_importar_n8n*.json` (bloqueado no `.gitignore`). O público é o `LabFlow.json`, gerado por `scripts/sanitize-workflow.ps1` e auditado por `scripts/audit-workflow.py --public`.
- Nunca esvaziar a tabela `usuarios` (sem usuários o bot bloqueia todo mundo). Backup antes de qualquer migration ou limpeza.

## Termos do domínio
- Não usar o termo "reanálise". D5/D10/D15 são "análises de drop" (ou só "drops").
- **TAB e Coliformes são masculinos** nos textos para o usuário ("o TAB está Incubado", "os Coliformes estão Estriados"). No banco, os status continuam `Incubada`, `Estriada`, `Concluída`.
- "Hoje" é sempre em `America/Sao_Paulo`.

## Workflow do n8n
- Mudança grande: o Claude monta o JSON por script, o Danyllo importa **como cópia**, troca o ativo e testa pelo WhatsApp. O arquivo anterior é o rollback.
- Depois de mexer no workflow, rodar a auditoria e os testes (no Windows o Python é o `py`):
  - `py scripts/audit-workflow.py LabFlow.json --public` (0 erros); o mesmo para `LabFlow_Alerta_Erro.json` (workflow de alerta de erro)
  - `npm test` (testes do node `Interpretar comando`, em `tests/`). Para testar o arquivo de importação: `$env:LABFLOW_JSON='LabFlow_importar_n8n.json'; npm test`.
- Comando novo ou regra nova: acrescentar o caso em `tests/interpretar-comando.test.js` no mesmo PR.
- Todo ramo termina em `Respond to Webhook`. Node depois de um node com várias linhas precisa de `executeOnce`.
- Permissão é validada **no código**, nunca no prompt da IA (Bug 23).
- Depois de mudar o prompt da IA, reenviar uma frase de cada intenção (regressão).
- Passando código de node para o Danyllo colar, mandar só o código como texto enquanto iteram.

## Windows PowerShell 5.1 (armadilhas já vividas)
- Scripts `.ps1` em **ASCII**: acento sem BOM é lido como ANSI e estraga o texto (Bug 29). Texto com acento fica em arquivo lido como UTF-8.
- Depois de gerar arquivo por script, procurar `Ã`, `Â`, `�`.
- `>` e `>>` gravam UTF-16: usar `cmd /c "... > arquivo"` ou `Add-Content`.
- Enviar SQL ao servidor: `cmd /c "type arquivo.sql | ssh -o ClearAllForwardings=yes labflow docker exec -i labflow-postgres psql ..."`.
- Sem `&&`: usar `;` ou `if ($?)`.

## Documentação (cada instrução em um lugar só)
- Repositório: `docs/comandos.md` é a referência oficial dos comandos; `docs/handoff.md` guarda onde paramos; `docs/troubleshooting.md` guarda os bugs.
- Vault do Obsidian (`OneDrive\Valts\PROJETO- LABFLOW`): a sintaxe dos comandos mora só em `Comandos-Disponiveis`; o "próximo" só no `backlog`; o histórico no `decisoes-log`; comandos de servidor e banco em `00-Servidores` e `Postgres-Migracao`. Notas de domínio só explicam regras.
- Comando novo: atualizar `docs/comandos.md`, a cheatsheet do vault, o CHANGELOG e o backlog.

## Ao encerrar o dia
Atualizar `docs/handoff.md`, o `decisoes-log` e o `backlog`, e pedir ao Danyllo que faça o commit e o push.
