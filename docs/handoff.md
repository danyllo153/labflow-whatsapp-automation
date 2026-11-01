# LabFlow — onde paramos e para onde vamos (handoff)

Documento para retomar o projeto em outro computador ou numa conversa nova do Claude Code. Leia a seção 0 antes de propor qualquer coisa. O que está em **decidido** já foi combinado com o Danyllo; o que está em **a definir** precisa ser perguntado antes de implementar. O repositório é a fonte da verdade do estado e dos planos: o "próximo" mora em [`backlog.md`](backlog.md), as mudanças no [`CHANGELOG.md`](CHANGELOG.md), o histórico deste arquivo em [`handoff-historico.md`](handoff-historico.md). O Obsidian guarda só o que não pode ir para o Git (servidor, senhas, limites reais) e as regras de domínio do laboratório.

Última atualização: 27/10/2026, tarde (app até o #344 no ar, commit `b6be510`, migrations até a 081; bot até a 108, workflow `pre88`).

## 0. Onde paramos (leia primeiro)

> **Regra (24/10/2026):** cada sessão (bot e app) mantém **um bloco só** aqui, o mais recente. Ao escrever o novo, o antigo vai para o topo de [`handoff-historico.md`](handoff-historico.md), que ninguém precisa ler no dia a dia. O "próximo" mora em [`backlog.md`](backlog.md).
>
> **26/10/2026, madrugada — sessão do bot (PC), onde paramos.** **Depois (26/10): publicado o #320** (gráficos de resultado com Chart.js nas páginas de dados; commit `5bb6a25` no servidor, só o container, sem migration; `labflow-api` Up (healthy), log sem erro). **Depois, publicado o #322, #324 e #325** (cores do gráfico; telas padronizadas parte 1; gráfico de resultado em Tanques, Howard, Coliformes, Água, Baias e Linhas; commit `46bef52` no servidor, só o container, sem migration; `labflow-api` Up (healthy), log sem erro). **Depois, publicado o #327** (menu lateral por análise, com grupos que abrem e fecham, e gaveta no celular; commit `f613814` no servidor, só o container, sem migration; `labflow-api` Up (healthy), log sem erro). **Depois, publicado o #329** (visual novo: topo escuro com busca e claro/escuro, faixa da família, abas em pílula, números com ícone, atrasados no menu; commit `818ecae` no servidor, só o container, sem migration; `labflow-api` Up (healthy), log sem erro). **Depois, publicado o #331** (Resultados com a tabela dentro do app, sem Visão geral, Coletas no menu, telas compactas; commit `8fa42f2` no servidor, só o container, sem migration; `labflow-api` Up (healthy), log sem erro). **#333 no ar (commit 599aa02)** (Início alinhado em linhas, gráfico da semana, TAB positivos compactos; só o container, sem migration; `labflow-api` Up (healthy), log sem erro). **#335 no ar (commit 251e59c)** (visual Star Admin no app inteiro, Início novo com a rota `GET /painel/turnos`, filtro por fábrica; só o container, sem migration; `labflow-api` Up (healthy), log sem erro; a rota nova responde 401 sem sessão). **27/10, ~01:10: #337 no ar (commit `4010b0f`)** (leituras por análise, laudos refeitos, tanques terra e navio, rastreável e água de consumo). Backup antes: `labflow_2026-10-27_0106.dump`. Migrations do app **077** (excluir/finalizar laudos), **078** (leitura de drops) e **079** (água de consumo: 20 pontos e 6 limites fictícios; o Danyllo grava os reais pelo app), com `-U $POSTGRES_USER`, todas com COMMIT. `labflow-api` Up (healthy), log sem erro. Próxima livre do app: **080**. **NO AR (26/10, ~02:15, tudo de uma vez a pedido do Danyllo, vindo da sessão do app):** main `226a33b` no servidor; mesclados #315 e #316 (app), #312 e #314 (handoffs) e **#317 (PB23)**. Backup do banco antes: `labflow_2026-10-26_0212.dump`. Migrations aplicadas com `-U $POSTGRES_USER`, todas com COMMIT: **076** do app (laudos de TAB, Coliformes, Howard, NFC tanques, Embarque e contra-amostra; tabela `app.laudo_linhas`; a check `paginas_laudo_laudo_check` com os 7 laudos novos) e **108** do bot (PB23: caixas do recebimento **121 a 153**; as caixas 146 a 153 saíram de navio e a família que começava na 146 começa na 154, onde os navios dela já estavam; conferido: 33 caixas de recebimento, sugerida 121). Container `labflow-api` **Up (healthy)**. **Workflow publicado** (`caixa N` de 121 a 153 é recebimento; ajuda e erro com 121 a 153): backup `pre88`, 271 nós, ativo, webhook 1x; antes de publicar, o no ar era igual à main a menos das 4 trocas do PB23. Arquivos fora do Git: `C:\Dev\estudos\ia\wf-final-pre88.json` e `n8n-publicar88.sh`. **Faixa do bot: 100–149**; a **107** fica reservada para o relatório do dia; próxima livre depois dela: **109**. **Fica com a sessão do app:** os comentários "121 a 145" em `Arquivo.tsx` e `rotas_arquivo.py` e marcar o PB23 como feito no rumo. **Testar ao vivo:** `caixa 150` (recebimento, disponível) e `arquivei load ... caixa 153`. **Próximo (ordem combinada com o Danyllo em 26/10, retomar daqui, um PR por item):** **1)** relatório do dia numa **função do banco** (migration 107) que o bot e o app leem; hoje o app copia em Python as consultas do bot (#291, `rotas_relatorio_dia.py`) e o relatório não conta água do processo, baias, linhas e esterilização; trocar os nodes `BD · Relatório NFC`/`BD · Relatório concentrado`/`Montar relatório geral` pela função e pedir ao app (rumo) para ler a mesma; **2)** corrigir resultado de C.T/B.L com motivo numa **função geral** `corrigir_resultado(quem, ...)` (hoje só `corrigir_resultado_pelo_bot`, 039), com GRANT ao app; **3)** PB21 parte 2: a **caixa do recebimento pela foto** e `caixa N` no próprio comando de recebimento; **4)** registrar **por frase** o que só o app faz: material asséptico, lote de meio (receber e trocar o em uso) e temperatura das estufas (pelas funções do app); **5)** foto: o "+" da confirmação do TAB e TAB/Coliformes da folha de embarque; **6)** manutenção: as 14 frases da regressão da IA, ajuste do prompt da foto com erros reais, testes dos `Montar ...`. **Testes ao vivo com o Danyllo:** `pendências do dia` a partir de 26/10 (os TABs incubados vencem), o aviso do Coliformes obrigatório no próximo load novo, `arquivei ... caixa 121` e `descartei caixa 121`, foto do load 43599, embarque com dois loads, foto de embarque com resultados, NFC com placa alta, Coletor no celular. **Fechado em 26/10:** o laboratório não escreve a diluição de outro jeito (nada a fazer); as instruções de cada análise o Danyllo escreve no app. **Como retomar:** `git pull` na `main`, este bloco e a seção 🤖 do `docs/backlog.md`; scripts fora do Git em `C:\Dev\estudos\ia` (`aplicar-106.sh`, `n8n-publicar87.sh`, `arquivo\`) e `C:\Dev\estudos\patch\gerar-importacao.js`; para publicar: gerar o import, trocar id/nome, `scp` e `cmd /c "ssh labflow bash -s < script"` (o PowerShell não aceita `<`); as alterações do Power BI em `powerbi/` não são do bot.
>
> **01/11/2026 — sessão do APP (nuvem), onde paramos.** **No ar (publicado pelo Danyllo, só o container, sem migration):** app até o **#350** (commit `d70d74c`; migrations do app até a **081**). Entraram: **#348** **LabFlow Lite** (spec `12-versao-lite.md`: o app inteiro rodando da pasta G: do laboratório; o primeiro PC vira o servidor com PostgreSQL local e os outros abrem o navegador nele; cópia no G: a cada minuto e ao fechar, backup diário, troca de servidor quando um PC cai; banco começa vazio com Admin provisório; **marca da instalação** em `dados\marca` (nome, logo, cores, `estilo.css`), laudos seguem nos modelos da empresa; pacote montado e testado no Windows pelo `app-lite.yml`, baixar em Artifacts) e a **busca de rastreio no topo** (load, tanque, navio e arquivo de contra-amostras, inclusive o descartado; `GET /busca`; as páginas do load, navio e tanque mostram as caixas do arquivo; o #349 foi fechado porque entrou junto no #348); **#350** **tour guiado em vídeo** com voz de IA (`app/tour/`, `app-tour.yml`; o vídeo sai em Artifacts e nunca vai para o Git; sincronia pela marca de cada passo no próprio vídeo). **Próximo passo:** o Danyllo testa a busca no ar e o pacote da Lite num PC Windows; depois, nos PCs da micro (servidor = o PC ligado 24 h, Windows 10) com o `Testar rede.bat` e o pedido à TI da porta 8000; o Henry descompacta no G:. **Falta do Danyllo (no servidor, nunca no Git):** limites reais e nomes dos pontos da água de consumo, os PDFs-modelo em branco e conferir os limites dos tanques na `limites_nfc`. **Próxima livre do app: 082.**
### Como publicar uma mudança no n8n (pelo servidor, sem abrir a tela do n8n)
Só com o pedido do Danyllo ("aplique" / "mescle e publique"): o n8n fica fora do ar por alguns segundos no reinício.
1. PR com testes e auditoria verdes; mesclar (`gh pr merge <n> --squash --delete-branch`); `git pull` na `main`.
2. Gerar o arquivo de importação com os IDs reais: `node C:\Dev\estudos\patch\gerar-importacao.js` e gravar o resultado em `LabFlow_importar_n8n_ia.json`; conferir que `scripts/sanitize-workflow.ps1` devolve o `LabFlow.json` idêntico. Para publicar, trocar `id` por `MJMm3QnbqFrCafsz` e `name` por `LabFlow (Postgres)` (assim o import **sobrescreve** em vez de criar cópia).
3. No servidor: `docker exec labflow-n8n n8n export:workflow --id=MJMm3QnbqFrCafsz --output=/tmp/bk.json` (backup) → `docker cp` para `~/labflow/backups-n8n/` → copiar o arquivo novo → `n8n import:workflow --input=...` → `n8n publish:workflow --id=MJMm3QnbqFrCafsz` → `docker restart labflow-n8n` → esperar `http://127.0.0.1:5679/healthz`.
4. Conferir no banco do n8n (cópia do sqlite, só leitura): workflow ativo, nº de nodes, webhook `labflow-registro` registrado uma vez. Testar com mensagens pelo webhook (script `teste-pos-import.sh`).
Os scripts prontos estão em `C:\Dev\estudos\ia\` (`n8n-publicar*.sh`, `n8n-verifica.sh`, `teste-pos-import.sh`) e na cópia `Valts\estudos-labflow\` do OneDrive. Os construtores de patch (`construir*.js` + `aplicar-patch.ps1`) editam o `LabFlow.json` preservando o formato do repositório.

### Cuidados
- Nada de foto de laudo no repositório (têm o logotipo da empresa); os testes usam respostas simuladas da IA.
- Nunca escrever telefones, chaves ou valores de limites reais em notas ou no repositório. A chave do Gemini só existe criptografada no n8n; para testar o Google direto, usar `C:\Dev\estudos\testar-gemini-foto*.ps1` (pergunta a chave e não grava).
- O console do PowerShell do Claude bloqueia texto com `rm`; para limpar arquivos temporários no servidor usar `find ... -delete`.

## 1. Quem sou e como gosto de trabalhar

- Danyllo Gomes, biomédico (microbiologia / controle de qualidade de suco) e estudante de Ciência da Computação. O LabFlow é projeto de portfólio para transição de carreira (dados, automação, bioinformática).
- Explicações passo a passo, em comandos pequenos, um de cada vez. Sem experiência prévia em PostgreSQL, Power BI e n8n avançado; no n8n, um node por vez.
- O Claude commita, faz push e abre o PR; **mescla, taguea e publica no n8n só quando o Danyllo pede** ("mescle", "aplique"), a cada vez. Branch por mudança, Conventional Commits em português, **sem** trailer `Co-Authored-By` nem rodapé de ferramenta. Nunca editar pelo site do GitHub.
- Enquanto iteramos em nodes: só o código/prompt do node como texto. `LabFlow.json` completo e JSON de importação só quando ele pedir. Mudança grande no workflow: o Claude monta o JSON de importação por script, ele importa **como cópia**, troca o ativo e testa pelo WhatsApp; o arquivo anterior é o rollback.
- Dicas práticas de mercado e portfólio no meio da ajuda técnica. Respostas em português.
- Dados sempre fictícios (LGPD). Nada real da empresa no repositório, nos testes ou na documentação.
- Termos: não usar "reanálise" (D5/D10/D15 são "drops"); **TAB e Coliformes são masculinos** nos textos ao usuário ("o TAB está Incubado"); no banco os status continuam `Incubada`, `Estriada`, `Concluída`.

## 2. Estado atual (base de 07/10/2026; números atualizados em 14/10)

**Versão publicada:** `v1.2.0` (09/10/2026). **Na `main`, ainda não lançado (`v1.3.0`):** comando por áudio, painel Desvios geral, IA resiliente (Groq + limite diário), ajuda completa, fábricas travadas, consultas de quem coletou e de resultados, leitura de laudo por foto.

**Repositório:** `github.com/danyllo153/labflow-whatsapp-automation` (público), clone em `C:\Dev\labflow-whatsapp-automation`. Notas no Obsidian (vault `PROJETO- LABFLOW`). Cópia no OneDrive: `Valts\labflow-whatsapp-automation` (o `C:\Dev\sync-valts.bat` copia para lá).

**Ambiente:** o servidor atual é de **demonstração**, com dados fictícios. Na empresa, servidor, Postgres e Power BI serão os da empresa, com migração e segurança definidas junto com a TI (ideia: um "Guia de implantação do LabFlow").

**Stack** (VPS Linux, `~/labflow`, Docker, sem porta pública, acesso só por túnel SSH): WhatsApp Business (eSIM dedicado) → Evolution API 2.3.7 (`labflow2`) → n8n 2.38.6 → PostgreSQL (banco `labflow`, separado do banco da Evolution) → resposta no WhatsApp. IA: Gemini (`models/gemini-3.1-flash-lite`) só como fallback da regex.

**Em números:** 235 nodes no `LabFlow.json` · 20 migrations · 406 testes (`npm test`) · auditoria do workflow com 0 erros · GitHub Actions (auditoria + testes) verdes · PRs até o #53.

**No servidor:** migrations `001` a `020` aplicadas; backup diário às 3h (14 dias) em `~/labflow/backups`, e backups do workflow do n8n em `~/labflow/backups-n8n`; aviso de queda no healthchecks.io (`~/labflow/heartbeat.sh`, cron a cada 5 min). O banco tem **dados reais do mês de teste do piloto** (a apagar no fim) misturados com dados de teste do desenvolvimento (ver seção 0). Limites do NFC e do Howard: os do laboratório, só no banco.

**Arquivos de workflow (na pasta do projeto):**
- `LabFlow.json` e `LabFlow_Alerta_Erro.json`: versões **públicas**, sem IDs reais (vão para o Git).
- `LabFlow_importar_n8n*.json`: com **IDs reais**, nunca vão para o Git (bloqueados no `.gitignore`).
- Regerar o público: `scripts\sanitize-workflow.ps1 -Entrada LabFlow_importar_n8n.json -Saida LabFlow.json` e depois `py scripts/audit-workflow.py LabFlow.json --public` (0 erros). Antes de importar no n8n: `npm test`; para testar o arquivo de importação: `$env:LABFLOW_JSON='LabFlow_importar_n8n.json'; npm test`. Detalhes em [`scripts.md`](scripts.md).

**Power BI** (`powerbi/labflow.pbip`, formato PBIP versionado; cache e `.pbix` fora do Git):
- 9 páginas no padrão da página Coletas (cartões e filtros no topo, 3 gráficos, **uma** tabela): Visão geral, Coletas, Tanques, Drops, **Desvios** (hoje os de drop; depois, desvios de tanque e amostras repetidas), Recebimento, Embarque, TAB e Coliformes. Modo escuro; versão colorida de backup em `scripts/gerar-painel-powerbi-colorido.js`.
- Lê as views `bi.*` (migration 013) com `labflow_leitura`, pelo túnel `ssh -L 15432:172.16.2.2:5432 dan@IP-DO-SERVIDOR` (servidor `localhost:15432`). Abrir: túnel ligado → `labflow.pbip` → **Atualizar** → Ctrl+S.
- **Visual** (páginas, gráficos, filtros, tema e medidas): `node scripts\gerar-painel-powerbi.js` com o Power BI **fechado**; só o visual com ele **aberto e salvo**: `--so-relatorio` e depois recarregar. Identificadores fixos: rodar de novo não muda nada.
- **Modelo** (tabelas Loads, Embarques e Calendário, ligações, ajuste de medida com ele aberto): **Power BI Modeling MCP** (Microsoft), configurado no `.mcp.json` local (fora do Git; `cmd /c npx`). O Calendário liga ao C.T/B.L pela **data da amostra**.
- **Publicação (decidido em 06/10):** Power BI Desktop gratuito; publicado no "Meu workspace" da conta da faculdade, **só com dados fictícios** (o serviço online só aceita conta de trabalho ou escola). Para a empresa: `.pbix` (Desktop ou "Meu workspace" de quem tem conta de trabalho; abrir o **relatório**), PDF e vídeo. Dado real só no ambiente da empresa, com a TI (Pro + gateway).
- O Power BI **não edita dados**. Exportar para o Excel: `...` do visual → Exportar dados (CSV com vírgula; no Excel, **Dados → De Texto/CSV**, UTF-8, delimitador Vírgula) ou, em `.xlsx` direto, pelo DBeaver (`LabFlow (leitura)` → views `bi.*`).

## 3. O que já funciona

- **NFC (tanques):** coleta de terra (até 8) e de navio (até 16, nome + viagem), drops D5/D10/D15, bag/pote +365 dias, análise Normal/Stress (CT, BL, WORT) que **exige coleta**, consultas do dia, conclusão em lote com "sim/não" e registro de quem leu, bloqueio de coleta duplicada, **desvio de drop** (repetição em 7/13/25 °C, resultado por temperatura).
- **Concentrado (FCOJ):** recebimento por load/item/fábrica, compostas `#N` (qualquer combinação de lotes), embarque por navio/linha/fase (A1, A2..., load antigo cadastrado na hora), TAB (composta e tanque NFC), Coliformes (confirmação abre a composta lote a lote), Howard (% em 50 campos, sempre par), C.T/B.L por lote e amostra (`=`, `<`, `>`), alarme B.L ≥ 50 e C.T ≥ 200.
- **Relatório diário** em 4 blocos (FCOJ recebimento/embarque, NFC tank farm/navio), ✅ e 🚨, `relatório do dia completo`, filtros por bloco, `leitura do dia finalizada` ("finalizada por X às HH:MM").
- **Permissões:** só números cadastrados; cargos Admin, Operador, Consultor (Consultor só consulta; só Admin troca cargo). Permissão validada **no código**, nunca no prompt (Bug 23).
- **IA:** cobre todos os comandos reescrevendo a frase num formato oficial do catálogo; dado faltando vira pergunta; o código valida e reenvia pela regex; gravações pedem "sim". Regressão do prompt por script (44 de 44 no Gemini real).
- **Operação:** alerta de erro no WhatsApp para os Admin (não dispara se o servidor ou o n8n caírem), backup diário, usuário somente leitura.
- **Power BI:** ver seção 2.

Comandos em [`comandos.md`](comandos.md), concentrado em [`concentrado.md`](concentrado.md), arquitetura em [`arquitetura.md`](arquitetura.md).

## 4. Para onde vamos: LIMS (decidido em 07/10/2026)

**Objetivo final:** LIMS próprio com app web/mobile (PWA), login e IA embutida, onde o usuário vê o que registrou e as suas últimas análises. O WhatsApp continua como canal. As fases 1 a 3 cobrem os requisitos de um laboratório acreditado pela **ISO/IEC 17025** (rastreabilidade, especificações, revisão e liberação de resultados).

0. **Fechar a v1.2.0** (seção 0).
1. **Base de LIMS no banco:** audit trail por triggers (quem, quando, tabela, valor antigo × novo); tabela de **especificações** (limites por análise × produto/item/cliente, substituindo os limites fixos); fluxo **lançado → revisado → liberado**, com aprovação por outra pessoa.
2. **API própria:** FastAPI (sugerido) num container novo da stack; senha em hash (argon2/bcrypt) + JWT ligados a `usuarios` (mesmo cargo do WhatsApp); começar só leitura.
3. **PWA só leitura:** React + Vite (login, meus registros, minhas análises, painel do dia, relatório).
4. **Escrita pelo app:** primeiro um chat embutido usando o mesmo pipeline do n8n (regex → IA → "sim"), sem duplicar regras; depois formulários, migrando as regras dos Code nodes para a API aos poucos.
5. **IA avançada:** comando por áudio (transcrição → mesmo parsing) e leitura de laudo por foto, sempre com confirmação antes de gravar.
6. **Extras de LIMS:** laudo PDF por load/embarque, meios e reagentes, equipamentos (estufas: temperatura, calibração), localização da amostra + QR code, não conformidades gerais, arquitetura de tanques do navio (tanque do navio ↔ loads, TT).

- **Contínuo:** testes, docs, CHANGELOG e ADRs em `docs/decisoes/`.

**Especificação do LIMS (Spec-Driven Development):** [`specs/lims/`](specs/lims/index.md), com um documento por assunto (visão geral, atores, audit trail, especificações, revisão e liberação, banco, API, app, fluxos, pontos de atenção, decisões e guia prático), todos em `draft v0.1`. Começa **depois da Fase 0**: cada documento é refinado até `v1.0` e só então vira tarefa e código, seguindo as regras anti-alucinação do `guia-pratico.md`.

Detalhes e o comparativo "o que temos × o que falta para ser um LIMS" na nota `Roadmap-V1-V6` do Obsidian. Tarefas do dia a dia, só no `backlog`.

## 5. Banco de dados

Plano e decisões em [`postgres-migracao.md`](postgres-migracao.md); migrations em [`../db/migrations/`](../db/migrations/) (`001` a `019`, uma de cada vez, com `-v ON_ERROR_STOP=1`). A coleta é o centro (drops, arquivo e análises apontam para `coleta_id`); no concentrado, a ordem é *recebimento → compostas → testes*. `tanque` é TEXT; datas em `America/Sao_Paulo`; o banco confere as regras de novo (UNIQUE, CHECK, FK). Usuários: `labflow_app` (n8n) e `labflow_leitura` (DBeaver e Power BI). Senhas só em `~/labflow/.env` no servidor.

Aplicar uma migration a partir do PC (antes: testar numa transação desfeita e fazer backup com `ssh labflow "cd ~/labflow && ./backup-db.sh"`):

```powershell
cmd /c "type db\migrations\NNN_nome.sql | ssh -o ClearAllForwardings=yes labflow docker exec -i labflow-postgres psql -U labflow_app -d labflow -v ON_ERROR_STOP=1"
```

(`ssh labflow` é um atalho do `~/.ssh/config` do PC principal, que também abre o túnel do n8n e da Evolution; no notebook use `dan@IP-DO-SERVIDOR`. `cmd /c` evita que o PowerShell estrague acentos.) **Nunca esvaziar a tabela `usuarios`**: sem usuários o bot bloqueia todo mundo.

## 6. A definir (perguntar antes de implementar)

1. **Situação ok/não ok:** limites oficiais do Howard e do NFC (C.T, B.L, Psicrotróficos) e regra dos drops. Decidido em 04/10: TAB/Coliformes positivo = `não ok` e 🚨. **Sugestão:** gravar os limites numa tabela simples já agora (análise → limite), que vira a tabela de especificações da Fase 1 sem retrabalho.
2. **Ordem do áudio:** está na Fase 5; sugestão do Claude é adiantar para logo depois da v1.2.0 (é barato, porque a IA já entende números por extenso e o pipeline existe, e tem valor prático, já que o analista usa luva, e de portfólio).
3. **Quem libera resultados ruins** (Fase 1): cargo `Revisor` novo ou Admin/Operador liberando o que outra pessoa lançou (recomendado). Ver seção 0.
4. **API:** FastAPI (sugerido) ou Node.
5. **Acesso externo ao app sem abrir porta:** Cloudflare Tunnel ou Tailscale.
6. **Cópia do backup fora do servidor** (enquanto os dados forem fictícios, pode ir para o OneDrive) e **monitor externo** (Uptime Kuma).
7. **Uso com dado real:** depende da TI da empresa e de adequação à LGPD; o servidor atual é só de demonstração.

## 7. Lições que valem daqui para frente

- Mudança grande sempre reversível: workflow novo como cópia, antigo desativado como plano B.
- Depois de mudança estrutural no n8n: exportar, `npm test` e `py scripts/audit-workflow.py LabFlow.json --public` (0 erros).
- Teste que nunca falha não protege nada: injetar um defeito de propósito numa cópia e conferir que algum teste falha. Comando ou regra nova: caso novo em `tests/interpretar-comando.test.js` no mesmo PR.
- Migration e seed: testar antes numa transação desfeita (`BEGIN ... ROLLBACK`) e fazer backup antes de aplicar.
- Todo ramo termina em `Respond to Webhook`; node depois de um node com várias linhas precisa de `executeOnce`; "hoje" sempre em `America/Sao_Paulo` (no banco, `CURRENT_DATE`).
- Prompt é código: rodar a regressão do prompt depois de qualquer mudança. A IA sugere, o código decide; permissão nunca no prompt.
- Código dos nodes pode ser testado fora do n8n (extrair o `jsCode` do JSON e executar com mensagens de exemplo).
- Windows PowerShell 5.1: scripts `.ps1` em ASCII (Bug 29); depois de gerar arquivo por script, procurar `Ã`, `Â`, `�`.
- Power BI como código: o arquivo é escrito por duas ferramentas (o gerador e o Power BI ao salvar, que tira as aspas dos nomes: Bug 31); maiúscula e minúscula são o mesmo nome (Bug 32). Números do painel: conferir contra o banco (DAX pelo MCP × SQL no `labflow_leitura`). Depois de mudar o banco: **Atualizar** e Ctrl+S.
- Antes de taguear: `git switch main && git pull` e conferir com `git log -1` (Bug 30).
- Nunca commitar IDs reais, chaves, telefones reais, IP do servidor ou `.env`.
