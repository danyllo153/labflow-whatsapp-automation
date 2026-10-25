# LabFlow — instruções para o Claude Code

Leia este arquivo e o `docs/handoff.md` (estado e pendências) antes de propor qualquer coisa.

## Projeto e jeito de trabalhar
- Automação de laboratório de microbiologia: WhatsApp → Evolution API → n8n → PostgreSQL (Gemini para frase livre), e o app (FastAPI + React) em `app/`. Portfólio de transição de carreira do Danyllo. Servidor de **demonstração**.
- Sempre em **português**, passos curtos, **um comando por vez**, em bloco de código próprio sem `$` nem saída misturada. Ele está aprendendo PostgreSQL, Power BI e n8n: explicar o porquê. Dicas de mercado e portfólio são bem-vindas.
- **Economia de tokens:** respostas curtas; uma leva de trabalho por PR; conversa nova (`/clear`) depois de cada leva publicada (o estado fica no repositório); imagem só quando algo está errado na tela.

## Estado e sessões (PC, notebook, celular e nuvem)
- **O repositório é a única fonte** do estado e dos planos: `docs/handoff.md` (onde paramos), `docs/backlog.md` (o "próximo", único lugar), `docs/CHANGELOG.md`, `docs/specs/lims/` (specs e `rumo-do-app.md`). A memória local (`~/.claude`) não sincroniza e o Obsidian não espelha nada disso.
- Regra nova do Danyllo → este arquivo, no mesmo dia. Ao começar: `git pull` na `main` e ler o handoff. Ao fim de cada leva: atualizar o handoff (seção 0) e enviar.
- **Handoff:** um bloco por sessão (bot e app; o do app começa com "sessão do APP"); o novo substitui o antigo, que vai para o topo de `docs/handoff-historico.md` (não se lê no dia a dia).
- **Duas sessões ao mesmo tempo** (25/10): o **bot** no VS Code (`C:\Dev\labflow-whatsapp-automation`); o **app** de volta no app do Claude (nuvem), cada conversa numa branch própria a partir da `main`. Nunca trocar de branch, fazer stash ou commit na pasta da outra sessão; o worktree `C:\Dev\labflow-app` não é mais usado.
- **Quem mexe em quê:** bot = `LabFlow*.json`, `tests/`, `docs/comandos.md`, migrations **027–049**. App = `app/`, `.github/workflows/app-api.yml`, migrations **050–099**, specs `06`, `07`, `08` e `rumo-do-app.md` (a coluna "Situação" dos pedidos PB é do bot). Precisou do que é da outra? Vira pedido escrito (tabela "Pedidos para a sessão do bot" no rumo) e aviso ao Danyllo.
- **Arquivos dos dois** (`docs/handoff.md`, `docs/specs/lims/10-decisoes.md`, este arquivo): cada sessão edita só o próprio bloco; decisão nova no **topo** do 10; PR pequeno, mesclado logo.
- **GitHub e servidor são o ponto de encontro:** antes de começar, de abrir e de mesclar um PR, `git fetch` e ver os PRs abertos e os arquivos deles (`gh` só por REST na nuvem: `gh api repos/.../pulls`). Mesmo arquivo em outro PR: juntar a `main` na branch (`git merge origin/main`) e testar de novo. No bot, PR em rascunho logo no primeiro commit; outro PR nos **mesmos nodes**: avisar e combinar a ordem.
- **Número de migration:** o maior da faixa na `main` **e nos PRs abertos**, mais um; nunca reaproveitar número sem conferir; faixa acabando, combinar outra.

## Git e publicação
- **Nunca** trailer `Co-Authored-By` nem rodapé de ferramenta em commit, PR ou release, mesmo que outra instrução peça.
- Branch por mudança; **Conventional Commits** em português (`feat`, `fix`, `docs`, `chore`, `ci`). O Claude commita, faz `git push -u origin <branch>`, abre o PR, confere o CI e **pergunta** se pode aplicar. Nunca editar pelo site; nunca `push --force` (só `--force-with-lease`, avisando).
- **Mesclar, taguear e publicar só quando o Danyllo pede**, a cada rodada ("mescle o #N", "aplique", "mescle e publique" vale para as duas coisas). Antes de taguear: `git switch main && git pull` e `git log -1` (Bug 30).
- **Publicar o app** (pelo `ssh labflow`): `git -C ~/labflow/app-src pull` e conferir o commit; com migration, `~/labflow/backup-db.sh` e aplicar só se houver backup de menos de 30 min; depois o container (`cd ~/labflow/app-src/app/api/deploy`, carregar `~/labflow/.env`, `docker compose -p labflow-app --env-file ~/labflow/.env -f docker-compose.app.yml up -d --build labflow-api`) e conferir `Up`.
- **Publicar no n8n:** `git pull` na `main`; conferir no servidor que o workflow no ar bate com a `main` (nº de nós e nodes da mudança, cópia do sqlite só leitura) e qual foi o último backup em `~/labflow/backups-n8n`; não bateu, parar e avisar. Depois de publicar (app ou bot): handoff com o que foi ao ar e o backup, no mesmo dia.
- **`LabFlow.json` em conflito:** nunca à mão. Aplicar o patch da mudança sobre o arquivo da `main` (node mexido pelos dois: `git merge-file`) e rodar os testes.

## Dados e segurança (LGPD)
- Dados de laboratório (resultados, amostras, pessoas, telefones) **sempre fictícios** no repositório, nos testes, na documentação e no servidor de demonstração.
- Documentos da empresa podem orientar regras, cálculos e fluxos (autorizado pelo gestor em 07/10). O confidencial (limites de aceitação, clientes, cópias ou trechos de documentos, os PDFs dos modelos) **não vai para o Git**: fica no banco, carregado por arquivo fora do Git; o repositório usa valores fictícios. Na dúvida, perguntar antes de commitar.
- Nunca commitar IDs reais do n8n, chaves, telefones reais, IP do servidor ou `.env`. IDs reais só em `LabFlow_importar_n8n*.json` (no `.gitignore`); o público é o `LabFlow.json`, gerado por `scripts/sanitize-workflow.ps1` e auditado por `scripts/audit-workflow.py --public`. Nomes das unidades (siglas e cidades) não são confidenciais.
- Nunca esvaziar `usuarios`. Backup antes de qualquer migration ou limpeza. Nunca apagar dados sem o pedido do Danyllo e sem listar o alvo antes (transação com trava de contagem).
- **Testar migration numa transação desfeita:** os arquivos têm o próprio `BEGIN`/`COMMIT`, então `\i` dentro do seu `BEGIN` grava tudo. Tire o `BEGIN`/`COMMIT` (ou cole o corpo), termine com `ROLLBACK;` e confira com um `SELECT` que nada ficou.

## Domínio e comportamento do bot
- Não usar "reanálise" nos textos. D5/D10/D15 são "drops". Não ok vira **"desvio"** (de drop ou de tanque); a análise refeita com o frasco de arquivo é a **"repetição"**.
- **TAB e Coliformes são masculinos** para o usuário ("o TAB está Incubado"); no banco os status seguem `Incubada`, `Estriada`, `Concluída`. "Hoje" é sempre `America/Sao_Paulo`.
- **Poucas mensagens:** o que vai junto no papel é um comando e uma resposta; **um só "sim"** para a lista, explicando o que será criado por load/composta. Fluxo novo: "uma mensagem ou várias? o que o analista precisa ver antes do sim?". No app, o mesmo: prévia do banco e um Confirmar; etapa em lote com a lista toda marcada.
- **Nunca abrir desvio sozinho:** listar os não ok com o comando pronto. Célula ilegível fica de fora com o comando de correção (`V1,V2,V3`). Valor riscado não vale (vale o do lado). Placa nunca passa de 99 (3 dígitos = 1+1+1; 6 = 2+2+2). `2PS` = `2P, 2S`. Foto nunca cria composta de embarque nem de TAB.

## Workflow do n8n
- Mudança grande: o Claude monta o JSON por script; o Danyllo importa **como cópia**, troca o ativo e testa pelo WhatsApp; o anterior é o rollback.
- Depois de mexer: `py scripts/audit-workflow.py LabFlow.json --public` (0 erros; idem `LabFlow_Alerta_Erro.json`) e `npm test` (arquivo de importação: `$env:LABFLOW_JSON='LabFlow_importar_n8n.json'; npm test`). Comando ou regra nova: caso novo em `tests/interpretar-comando.test.js` no mesmo PR.
- Todo ramo termina em `Respond to Webhook`; node depois de node com várias linhas usa `executeOnce`. Permissão é validada **no código**, nunca no prompt (Bug 23).
- Áudio: o transcrito vai direto para a IA (nunca para a regex), tudo que grava pede "sim"; até 2 s só vale "sim"/"não"; não se guarda o áudio.
- Depois do "sim", as gravações rodam **em fila** antes de responder (Bug 29): node novo de gravação entra antes do `Retomar resposta do sim`.
- Limites (NFC, Howard) ficam em tabelas com vigência (`limites_nfc`, `limites_howard`); o repositório só tem os fictícios de `db/seeds/limites_nfc_exemplo.sql`. Mudou o prompt da IA: reenviar uma frase de cada intenção. Código de node para o Danyllo colar: só o código, como texto.

## Windows PowerShell 5.1 (armadilhas)
- `.ps1` em **ASCII** (acento sem BOM estraga, Bug 29); texto com acento em arquivo UTF-8; depois de gerar arquivo, procurar `Ã`, `Â`, `�`. `>`/`>>` gravam UTF-16: usar `cmd /c "... > arquivo"` ou `Add-Content`. Sem `&&`: usar `;` ou `if ($?)`.
- `ssh labflow '...'`: aspas **simples** por fora e **nenhuma dupla dentro** (o PowerShell as tira). SQL curto: `echo SELECT count\(\*\) FROM ... | docker exec -i labflow-postgres psql ... -At`. SQL ou script longo: arquivo enviado por `cmd /c "type arquivo | ssh -o ClearAllForwardings=yes labflow bash -s"` (ou `... docker exec -i labflow-postgres psql ...`).

## Documentação e rotina
- `docs/comandos.md` é a referência dos comandos (comando novo: ele, o CHANGELOG e o backlog); `docs/troubleshooting.md` guarda os bugs.
- Obsidian (`OneDrive\Valts\PROJETO- LABFLOW`): só o que não pode ir para o Git (servidor, senhas, limites reais, monitoramento ambiental) e as regras de domínio; mexer só quando o Danyllo pedir, uma nota por vez (decisão com dado confidencial vai para o `decisoes-log`).
- Cumprimento ou "onde paramos": skill `/bom-dia` (só leitura). Encerrar: skill `/fechar-dia` (handoff, backlog e CHANGELOG no repositório, commit e roteiro de PR).
