# LabFlow — onde paramos e para onde vamos (handoff)

Documento para retomar o projeto em outro computador ou numa conversa nova do Claude Code. Leia a seção 0 antes de propor qualquer coisa. O que está em **decidido** já foi combinado com o Danyllo; o que está em **a definir** precisa ser perguntado antes de implementar. O repositório é a fonte da verdade do estado e dos planos: o "próximo" mora em [`backlog.md`](backlog.md), as mudanças no [`CHANGELOG.md`](CHANGELOG.md), o histórico deste arquivo em [`handoff-historico.md`](handoff-historico.md). O Obsidian guarda só o que não pode ir para o Git (servidor, senhas, limites reais) e as regras de domínio do laboratório.

Última atualização: 25/10/2026, madrugada (072 aplicada; container do app pendente).

## 0. Onde paramos (leia primeiro)

> **Regra (24/10/2026):** cada sessão (bot e app) mantém **um bloco só** aqui, o mais recente. Ao escrever o novo, o antigo vai para o topo de [`handoff-historico.md`](handoff-historico.md), que ninguém precisa ler no dia a dia. O "próximo" mora em [`backlog.md`](backlog.md).
>
> **25/10/2026, noite — sessão do bot (PC), onde paramos.** **Fim da noite, NO AR (25/10, aplicado e publicado pelo Danyllo; backup do banco `labflow_2026-10-25_2013.dump`, workflow `pre86`, 271 nós, webhook 1x, conferido por mim):** backup do banco, migration **104** (Coliformes obrigatório: a 1ª composta do load, toda da COL e todo embarque; o que já existia não), migration **105** (PB21, arquivo de contra-amostras: recebimento 121-145, tanques 34-49, navio por família; comandos na seção 20 do `comandos.md`), a **carga inicial** (`C:\Dev\estudos\ia\arquivo\arquivo-carga.sql`, gerada da planilha por `gerar-carga.py`, fora do Git; rodar com `-v fim=COMMIT`) e publicar o workflow (`C:\Dev\estudos\ia\wf-final-pre86.json` + `n8n-publicar86.sh`). Depois, **106** (PB22 pendências do dia + apelidos de navio; aplicar ANTES de publicar o workflow `pre87`, que lê `navio_apelidos`; depois rodar `C:\Dev\estudos\ia\arquivo\corrigir-blossom.sql`, que põe o apelido do O.BLOSSOM). Próxima migration livre do bot: **107**. O classificador bloqueia para mim a produção (migration e publicação). Antes disto, **no ar:** workflow `MJMm3QnbqFrCafsz` com **271 nós** (último backup `pre85`); banco até a migration **103** do bot e a **072** do app. **Faixa do bot: 100–149** (próxima livre: **104**). **Hoje (25/10):** #280 (foto do recebimento de FCOJ lê o C.T/B.L por lote; traço = já digitado e marca um bloco; um sim; `pre83`) e **#286** com os pedidos do app: **PB18** (modelo do relatório completo em `docs/comandos.md`, seção 15), **PB19** (102: `registrar_embarque` aceita `load 43783/43784 item 2503/1233`, amostras no principal, tabela `embarque_loads` já com os 5 embarques antigos) e **PB20** (101 + correção **103**, #289: a composta do embarque nasce SEM teste e o **Coliformes fica pendente** até `coliformes feitos do navio ...`, que a resposta do bot lembra; view `vw_coliformes_pendentes` para o app; `criar_teste_da_composta(quem, composta_id, 'TAB'|'COLIFORMES'|'HOWARD', percentual, previa)` com GRANT ao app). Backup antes da 103: `labflow_2026-10-25_1857.dump`. Backup antes `labflow_2026-10-25_1825.dump`; ensaiadas em bloco desfeito; conferido no n8n (versão ativa nova, webhook 1x, 200). A sessão do app (nuvem) não recebe mensagem daqui: ela lê a situação na tabela do rumo. **Próximo:** testar ao vivo a foto do recebimento (load 43599) e um embarque com dois loads (`load A/B item X/Y`) e as compostas do navio (ver o "Coliformes pendente" e depois o `coliformes feitos do navio ...`). **Como retomar:** `git pull` na `main`, este bloco e a seção 🤖 do `docs/backlog.md`; scripts fora do Git em `C:\Dev\estudos\ia` (`n8n-publicar84.sh`, `aplicar-101-102.sh`) e `C:\Dev\estudos\patch\gerar-importacao.js`; as alterações do Power BI em `powerbi/` não são do bot.
>
> **25/10/2026, noite (2) — sessão do APP (nuvem), onde paramos.** **No ar (publicado em 25/10, commit `de4991c`, só o container, sem migration; `labflow-api` Up):** app até a migration **072** com o **#291** (página **Leituras**, na barra do celular: o relatório do dia igual ao do bot, nos 4 blocos, "Só o lido" = completo com ok/não ok, hoje ou 7 dias antes, Copiar, Enviar no WhatsApp e Imprimir; rota `GET /relatorio-do-dia`, que repete as consultas do bot) e o **#292** (estufas compactas: uma linha por estufa com Ok/Não ok das duas leituras e "Todas as pendentes Ok" com Confirmar, no cartão do alto do Turno e no Início; a página Estufas saiu do menu e `/estufas` leva ao Turno). **#293:** spec [`11-arquivo-contra-amostras.md`](specs/lims/11-arquivo-contra-amostras.md) e o pedido **PB21** ao bot (caixas de tanque terra = número do tanque, de navio por família e viagem, do recebimento 121 a 145; descarte em 1 ano, 2 anos com FCOJ, 7 dias; laudos por caixa; carga inicial da planilha, que fica fora do Git). **Precisa do Danyllo:** passar o PB21 e a planilha à sessão do bot; o PDF do modelo do laudo do Recebimento NFC. **Próximo do app:** conferir Leituras e Estufas no celular; quando o PB21 existir, a página **Arquivo**, o campo **Caixa** no recebimento e os laudos por caixa; botões "Criar TAB"/"Criar Howard" na composta do embarque (PB20 já feito).

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
