# LabFlow — onde paramos e para onde vamos (handoff)

Documento para retomar o projeto em outro computador ou numa conversa nova do Claude Code. Leia inteiro antes de propor qualquer coisa. O que está em **decidido** já foi combinado com o Danyllo; o que está em **a definir** precisa ser perguntado antes de implementar. Em caso de dúvida, o repositório (README, [`CHANGELOG.md`](CHANGELOG.md), `CLAUDE.md`) é a fonte da verdade. O "próximo" detalhado mora no `backlog` do Obsidian; o histórico com datas, no `decisoes-log`.

Última atualização: 07/10/2026 (rumo do LIMS definido; Power BI na `main`).

## 0. Onde paramos (leia primeiro)

**07/10/2026:** tudo na `main` e sincronizado (PR #22 do Power BI e PR #23 de docs mesclados). Nada pendente no notebook. Rumo do projeto definido: **LIMS próprio** com app web/mobile (seção 4).

**Próximo (Fase 0, fechar a v1.2.0):**
1. **Actions do GitHub**: subir as versões (`actions/checkout`, `setup-python`, `setup-node` avisam de Node.js 20 em desuso; o `ubuntu-latest` muda a partir de **19/10/2026**). Conferir que `audit-workflow.yml` e `testes.yml` continuam verdes.
2. **Acabamentos do painel**: filtro de Período começar onde há dados (hoje mostra 2025 a 2027); nomes longos de embarque quebrando linha nas tabelas estreitas.
3. **README**: marcar o Power BI (V5) como feito, roadmap do LIMS e prints/GIF das 8 páginas.
4. **Situação ok/não ok** em todas as linhas do relatório (falta a regra do Howard, do NFC e dos drops; ver seção 6).
5. **Lançar a v1.2.0** (tag + release; antes, `git switch main && git pull`, Bug 30).

**Ao abrir em outro PC:** instalar Python (marcando *Add python.exe to PATH*) e Node LTS, `git pull`, e conferir com `py --version`, `node --version` e `npm.cmd test` (no PowerShell com scripts bloqueados, use `npm.cmd` e `npx.cmd`). Roteiro completo na nota `Git/16 Trocar de PC e handoff` do Obsidian.

## 1. Quem sou e como gosto de trabalhar

- Danyllo Gomes, biomédico (microbiologia / controle de qualidade de suco) e estudante de Ciência da Computação. O LabFlow é projeto de portfólio para transição de carreira (dados, automação, bioinformática).
- Explicações passo a passo, em comandos pequenos, um de cada vez. Sem experiência prévia em PostgreSQL, Power BI e n8n avançado; no n8n, um node por vez.
- O Claude pode commitar localmente; **push, PR, merge e tag são do Danyllo**, pelo PowerShell (branch por mudança, Conventional Commits em português). Nunca editar pelo site do GitHub. Sem trailer `Co-Authored-By` nem rodapé de ferramenta.
- Enquanto iteramos em nodes: só o código/prompt do node como texto. `LabFlow.json` completo e JSON de importação só quando ele pedir. Mudança grande no workflow: o Claude monta o JSON de importação por script, ele importa **como cópia**, troca o ativo e testa pelo WhatsApp; o arquivo anterior é o rollback.
- Dicas práticas de mercado e portfólio no meio da ajuda técnica. Respostas em português.
- Dados sempre fictícios (LGPD). Nada real da empresa no repositório, nos testes ou na documentação.
- Termos: não usar "reanálise" (D5/D10/D15 são "drops"); **TAB e Coliformes são masculinos** nos textos ao usuário ("o TAB está Incubado"); no banco os status continuam `Incubada`, `Estriada`, `Concluída`.

## 2. Estado atual (07/10/2026)

**Versão publicada:** `v1.1.0` (04/10/2026). **Na `main`, ainda não lançado:** IA para todos os comandos, `leitura do dia finalizada`, desvio de drop, alerta de erro e painel do Power BI → `v1.2.0`.

**Repositório:** `github.com/danyllo153/labflow-whatsapp-automation` (público), clone em `C:\Dev\labflow-whatsapp-automation`. Notas no Obsidian (vault `PROJETO- LABFLOW`). Cópia no OneDrive: `Valts\labflow-whatsapp-automation` (o `C:\Dev\sync-valts.bat` copia para lá).

**Ambiente:** o servidor atual é de **demonstração**, com dados fictícios. Na empresa, servidor, Postgres e Power BI serão os da empresa, com migração e segurança definidas junto com a TI (ideia: um "Guia de implantação do LabFlow").

**Stack** (VPS Linux, `~/labflow`, Docker, sem porta pública, acesso só por túnel SSH): WhatsApp Business (eSIM dedicado) → Evolution API 2.3.7 (`labflow2`) → n8n 2.38.6 → PostgreSQL (banco `labflow`, separado do banco da Evolution) → resposta no WhatsApp. IA: Gemini (`models/gemini-3.1-flash-lite`) só como fallback da regex.

**Em números:** 177 nodes no `LabFlow.json` (35 terminam em `Respond to Webhook`) · 49 consultas parametrizadas (nodes de Postgres) · 14 migrations, 19 tabelas e 12 views · 208 testes (`npm test`) · 33 bugs documentados em [`troubleshooting.md`](troubleshooting.md).

**No servidor:** migrations `001` a `014` aplicadas; dados de demonstração carregados (`db/seeds/demo.sql`, reaplicados em 06/10); backup diário às 3h, 14 dias, em `~/labflow/backups` (`./backup-db.sh`). DBeaver: conexões `LabFlow (leitura)` e `LabFlow (app)` (tipo Production).

**Arquivos de workflow (na pasta do projeto):**
- `LabFlow.json` e `LabFlow_Alerta_Erro.json`: versões **públicas**, sem IDs reais (vão para o Git).
- `LabFlow_importar_n8n*.json`: com **IDs reais**, nunca vão para o Git (bloqueados no `.gitignore`).
- Regerar o público: `scripts\sanitize-workflow.ps1 -Entrada LabFlow_importar_n8n.json -Saida LabFlow.json` e depois `py scripts/audit-workflow.py LabFlow.json --public` (0 erros). Antes de importar no n8n: `npm test`; para testar o arquivo de importação: `$env:LABFLOW_JSON='LabFlow_importar_n8n.json'; npm test`. Detalhes em [`scripts.md`](scripts.md).

**Power BI** (`powerbi/labflow.pbip`, formato PBIP versionado; cache e `.pbix` fora do Git):
- 8 páginas no padrão da página Coletas (cartões e filtros no topo, 3 gráficos, **uma** tabela): Visão geral, Coletas, Tanques, Drops, Recebimento, Embarque, TAB e Coliformes. Modo escuro; versão colorida de backup em `scripts/gerar-painel-powerbi-colorido.js`.
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

Plano e decisões em [`postgres-migracao.md`](postgres-migracao.md); migrations em [`../db/migrations/`](../db/migrations/) (`001` a `014`, uma de cada vez, com `-v ON_ERROR_STOP=1`). A coleta é o centro (drops, arquivo e análises apontam para `coleta_id`); no concentrado, a ordem é *recebimento → compostas → testes*. `tanque` é TEXT; datas em `America/Sao_Paulo`; o banco confere as regras de novo (UNIQUE, CHECK, FK). Usuários: `labflow_app` (n8n) e `labflow_leitura` (DBeaver e Power BI). Senhas só em `~/labflow/.env` no servidor.

Aplicar uma migration a partir do PC (antes: testar numa transação desfeita e fazer backup com `ssh labflow "cd ~/labflow && ./backup-db.sh"`):

```powershell
cmd /c "type db\migrations\NNN_nome.sql | ssh -o ClearAllForwardings=yes labflow docker exec -i labflow-postgres psql -U labflow_app -d labflow -v ON_ERROR_STOP=1"
```

(`ssh labflow` é um atalho do `~/.ssh/config` do PC principal, que também abre o túnel do n8n e da Evolution; no notebook use `dan@IP-DO-SERVIDOR`. `cmd /c` evita que o PowerShell estrague acentos.) **Nunca esvaziar a tabela `usuarios`**: sem usuários o bot bloqueia todo mundo.

## 6. A definir (perguntar antes de implementar)

1. **Situação ok/não ok:** limites oficiais do Howard e do NFC (C.T, B.L, Psicrotróficos) e regra dos drops. Decidido em 04/10: TAB/Coliformes positivo = `não ok` e 🚨. **Sugestão:** gravar os limites numa tabela simples já agora (análise → limite), que vira a tabela de especificações da Fase 1 sem retrabalho.
2. **Ordem do áudio:** está na Fase 5; sugestão do Claude é adiantar para logo depois da v1.2.0 (é barato, porque a IA já entende números por extenso e o pipeline existe, e tem valor prático, já que o analista usa luva, e de portfólio).
3. **Quem revisa e libera resultados** (Fase 1): só Admin ou um cargo novo?
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
