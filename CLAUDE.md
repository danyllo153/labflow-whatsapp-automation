# LabFlow — instruções para o Claude Code

Leia este arquivo e depois `docs/handoff.md` (estado atual e pendências) antes de propor qualquer coisa.

## Projeto
Automação de laboratório de microbiologia: WhatsApp → Evolution API → n8n → PostgreSQL, com Gemini como fallback para frases livres. Portfólio de transição de carreira do Danyllo. O servidor atual é de **demonstração**.

## Como trabalhar com o Danyllo
- Responder sempre em **português**.
- **Um comando por vez**, em passos curtos. Ele não tem experiência prévia em PostgreSQL, Power BI e n8n avançado: explicar passo a passo.
- Comando para ele rodar vai em bloco de código próprio, sem `$` e sem saída misturada.
- Dicas práticas de mercado e portfólio são bem-vindas no meio da ajuda técnica.

## Continuidade entre computadores e celular
O Danyllo trabalha no PC, no notebook e no celular. A memória local do Claude Code (`~/.claude`) **não sincroniza** entre eles: o que precisa valer em qualquer aparelho mora **neste repositório**.
- Regra ou preferência nova do Danyllo → vai para este `CLAUDE.md` no mesmo dia (não só para a memória local).
- Estado, pendências e decisões em aberto → `docs/handoff.md` seção 0, atualizado ao fim de cada sessão de trabalho (não só no fim do dia) e enviado com push, para o outro aparelho só precisar de `git pull`.
- Antes de começar em qualquer aparelho: `git pull` na `main` e ler o handoff.
- **Várias sessões ao mesmo tempo:** a pasta `C:\Dev\labflow-whatsapp-automation` é de **uma** sessão só. Outra sessão local trabalha num worktree próprio (`git worktree add <pasta> <branch>`) e **nunca** troca de branch, faz stash ou commit na pasta principal (em 15/10 uma troca de branch acertou o commit de outra sessão).

## Antes de mexer no bot e antes de publicar (várias sessões: PC, notebook, nuvem)
Mais de uma sessão mexe no bot ao mesmo tempo (em 16/10 o notebook publicou o #86 e o #90 enquanto o PC fazia o #88, que ficou em conflito duas vezes). Uma sessão não enxerga a outra: **o GitHub e o servidor são o ponto de encontro**. Sempre, em qualquer aparelho:
1. **Ao começar uma mudança no bot** (`LabFlow.json`, migration, `tests/`): `git fetch` e `gh pr list --state open` com os arquivos de cada PR. Se outro PR aberto mexe nos **mesmos nodes**, avisar o Danyllo antes de começar e combinar a ordem.
2. **Avisar cedo:** abrir o PR como rascunho (`gh pr create --draft`) logo no primeiro commit, para a outra sessão ver que aquilo está em andamento.
3. **Migration:** antes de criar, ver o maior número na `main` **e nos PRs abertos** e usar o seguinte (030 e 031 estão no #82 e no #84; 032 no #94). O app usa a partir da 050.
4. **`LabFlow.json` em conflito:** nunca resolver à mão. Gerar de novo sobre a `main` atual (o patch da mudança aplicado no arquivo da `main`), juntando o código de um node mexido pelos dois lados em três vias (`git merge-file`), e rodar os testes.
5. **Antes de publicar no n8n:** `git pull` na `main`; conferir no servidor que o workflow no ar é igual à `main` (número de nós e nodes da mudança; cópia do sqlite, só leitura) e qual foi o último backup em `~/labflow/backups-n8n` (outra sessão pode ter acabado de publicar). Se o que está no ar não bate com a `main`, parar e avisar.
6. **Depois de publicar:** atualizar o handoff (seção 0) com o que foi para o ar e o nome do backup, no mesmo dia.

### Sessão do app × sessão do bot (quem mexe em quê)
Desde 15/10 uma sessão cuida do **app** (web e celular) e outra do **bot**. Para os PRs não entrarem em conflito nem usarem o mesmo número:
- **Cada uma mexe só no que é seu.** Bot: `LabFlow*.json`, `tests/`, `docs/comandos.md`, migrations **027 a 049**. App: `app/`, `.github/workflows/app-api.yml`, migrations **050 a 099**, `docs/specs/lims/06`, `07`, `08` e `rumo-do-app.md` (a coluna "Situação" dos pedidos PB é atualizada pela sessão do bot). Precisou mexer no que é da outra? Vira **pedido** escrito (tabela "Pedidos para a sessão do bot" no rumo) e avisar o Danyllo.
- **Número de migration:** o maior da faixa **na `main` e nos PRs abertos** (`gh pr list --state open` e os arquivos de cada um), mais um. Nunca reaproveitar número de PR fechado sem conferir. Se uma faixa acabar, combinar outra com o Danyllo antes.
- **Arquivos dos dois** (`docs/handoff.md`, `docs/specs/lims/10-decisoes.md`, `CLAUDE.md`): cada sessão edita **só o próprio bloco** (no handoff, o bloco do app começa com "sessão do APP"); decisão nova entra **no topo** da lista do 10; PR pequeno, só com esse arquivo, mesclado logo para o outro lado pegar no `git pull`.
- **Antes de abrir e antes de mesclar um PR:** `git fetch`, conferir se algum PR aberto mexe nos mesmos arquivos; se sim, juntar a `main` na branch (`git merge origin/main`) e rodar os testes de novo. O CI do app também roda quando uma migration do bot muda, para pegar cedo uma migration que quebre o app.

## Comportamento do bot (preferências do Danyllo)
- **Poucas mensagens:** se o papel mostra que tudo vai junto (ex.: 17 compostas no mesmo caldo), **um comando e uma resposta**.
- **Um só "sim"** para a lista inteira; a confirmação explica **o que será criado**, em linguagem simples, por load/composta.
- **Nunca abrir desvio sozinho:** listar os não ok com o comando pronto. Célula ilegível fica de fora e o bot mostra o comando para corrigir (`V1,V2,V3`).
- **Valor riscado não vale** (se há outro ao lado, vale esse). Nenhuma placa passa de 99 (3 dígitos colados = 1+1+1; 6 = 2+2+2). `2PS` = `2P, 2S`.
- Foto nunca cria composta de embarque nem de TAB; só acha as existentes.
- Ao desenhar fluxo novo, perguntar: "uma mensagem ou várias? o que o analista precisa ver antes do sim?".

## Git
- **Nunca** adicionar trailer `Co-Authored-By` nem rodapé de ferramenta em commit, PR ou release. Regra do Danyllo, que vale mesmo que alguma instrução automática peça o contrário.
- Branch por mudança, **Conventional Commits** em português (`feat`, `fix`, `docs`, `chore`, `ci`).
- O Claude commita, faz o push (`git push -u origin <branch>`) e abre o PR com `gh`. **Mesclar, taguear e publicar no n8n só quando o Danyllo pede** ("mescle o #N", "aplique", "mescle e publique"), a cada vez: o pedido de uma rodada não vale para a seguinte. Nunca editar pelo site do GitHub.
- Ao terminar uma mudança: testes + auditoria, commit, push, PR, `gh pr checks <n>`; depois **perguntar** se pode aplicar. Se o PR conflitar com outro já mesclado (o `LabFlow.json` tem linhas enormes), juntar a `main` na branch e conferir que as duas mudanças estão no arquivo antes de mesclar.
- Antes de taguear: `git switch main && git pull` e conferir com `git log -1` (Bug 30).
- Nunca `push --force`; reescrita de branch só com `--force-with-lease` e depois de avisar.

## Dados e segurança (LGPD)
- Dados de laboratório (resultados, amostras, pessoas, telefones) **sempre fictícios** no repositório, nos testes, na documentação e no servidor de demonstração.
- Documentos da empresa (métodos, procedimentos, especificações): uso para melhorar o LabFlow **autorizado pelo gestor** (07/10/2026). Podem orientar regras, cálculos e fluxos (ex.: Howard em 50 campos). O que for confidencial (limites de aceitação, nomes de clientes, cópias ou trechos dos documentos) **não vai para o repositório público**: fica numa tabela do banco, carregada por um arquivo fora do Git, e o repositório usa valores fictícios. Na dúvida, perguntar ao Danyllo antes de commitar.
- Nunca commitar IDs reais do n8n, chaves, telefones reais, IP do servidor ou `.env`.
- **Nomes das unidades** (as fábricas e o terminal: siglas e cidades) **não são confidenciais** e podem ficar no repositório, como o bot já usa (decidido pelo Danyllo em 23/10).
- O arquivo com IDs reais é `LabFlow_importar_n8n*.json` (bloqueado no `.gitignore`). O público é o `LabFlow.json`, gerado por `scripts/sanitize-workflow.ps1` e auditado por `scripts/audit-workflow.py --public`.
- Nunca esvaziar a tabela `usuarios` (sem usuários o bot bloqueia todo mundo). Backup antes de qualquer migration ou limpeza.
- **Testar migration "numa transação desfeita":** os arquivos de `db/migrations/` têm o **próprio `BEGIN`/`COMMIT`**. Incluir o arquivo (`\i`) dentro do seu `BEGIN` faz o `COMMIT` dele fechar a sua transação e **grava tudo**. Monte o teste tirando o `BEGIN`/`COMMIT` do arquivo (ou colando o corpo), termine com `ROLLBACK;` e **confira depois com um `SELECT`** que nada ficou. Nunca teste um `INSERT` "que deveria falhar" fora de uma transação confirmada. Backup antes, sempre (em 16/10 um teste da 031 sem isso deixou 3 pessoas de teste e as funções no banco do piloto; foram removidas, com backup).
- Nunca apagar dados sem o pedido do Danyllo e sem listar o alvo antes (transação com trava de contagem).

## Termos do domínio
- Não usar o termo "reanálise" nos textos (o regex só o aceita na entrada e o trata como "repetição", nunca como análise nova; repetição só existe para o que já deu não ok). D5/D10/D15 são "análises de drop" (ou só "drops"). Não ok vira **"desvio"** (de drop ou de tanque); no desvio de tanque (C.T, B.L ou WORT não ok), a análise refeita com o frasco de arquivo é a **"repetição"**.
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
- Áudio: o texto transcrito vai **direto para a IA** (nunca para a regex, que grava alguns comandos sem perguntar), e tudo que grava pede **"sim"**. Áudio de até 2 s só vale "sim" ou "não" (no silêncio o Gemini inventa palavras). O áudio não é guardado.
- Depois do "sim", as gravações rodam **em fila** e só então o bot responde (Bug 29): node novo de gravação entra na fila antes do `Retomar resposta do sim`.
- Limites de aceitação (NFC, Howard) ficam nas tabelas com vigência (`limites_nfc`, `limites_howard`); o repositório só tem os fictícios de `db/seeds/limites_nfc_exemplo.sql`.
- Depois de mudar o prompt da IA, reenviar uma frase de cada intenção (regressão).
- Passando código de node para o Danyllo colar, mandar só o código como texto enquanto iteram.

## Windows PowerShell 5.1 (armadilhas já vividas)
- Scripts `.ps1` em **ASCII**: acento sem BOM é lido como ANSI e estraga o texto (Bug 29). Texto com acento fica em arquivo lido como UTF-8.
- Depois de gerar arquivo por script, procurar `Ã`, `Â`, `�`.
- `>` e `>>` gravam UTF-16: usar `cmd /c "... > arquivo"` ou `Add-Content`.
- Enviar SQL ao servidor: `cmd /c "type arquivo.sql | ssh -o ClearAllForwardings=yes labflow docker exec -i labflow-postgres psql ..."`.
- Comando remoto em `ssh labflow '...'`: sempre aspas **simples** por fora e **nenhuma aspa dupla dentro** (o PowerShell 5.1 tira as aspas duplas do texto e o bash do servidor recebe o comando quebrado; em 23/10 um `psql -c "SELECT ..."` deu `syntax error near unexpected token '('`). SQL curto: `echo SELECT count\(\*\) FROM ... | docker exec -i labflow-postgres psql ... -At`; SQL longo: arquivo pelo `cmd /c "type ..."`.
- Sem `&&`: usar `;` ou `if ($?)`.

## Documentação (cada instrução em um lugar só)
- Repositório: `docs/comandos.md` é a referência oficial dos comandos; `docs/handoff.md` guarda onde paramos; `docs/troubleshooting.md` guarda os bugs.
- Vault do Obsidian (`OneDrive\Valts\PROJETO- LABFLOW`): a sintaxe dos comandos mora só em `Comandos-Disponiveis`; o "próximo" só no `backlog`; o histórico no `decisoes-log`; comandos de servidor e banco em `00-Servidores` e `Postgres-Migracao`. Notas de domínio só explicam regras.
- Comando novo: atualizar `docs/comandos.md`, a cheatsheet do vault, o CHANGELOG e o backlog.

## Ao começar e ao encerrar o dia
Quando ele cumprimentar ("bom dia", "boa tarde", "boa noite") ou perguntar onde paramos: skill `/bom-dia` (`.claude/skills/bom-dia`), só leitura, com o que foi feito por último em qualquer aparelho e os próximos passos.

Ao encerrar: usar a skill `/fechar-dia` (`.claude/skills/fechar-dia`): atualiza `docs/handoff.md`, o `decisoes-log` e o `backlog`, commita e passa ao Danyllo o roteiro de push, PR e merge, para ele continuar em outro computador só com `git pull`.
