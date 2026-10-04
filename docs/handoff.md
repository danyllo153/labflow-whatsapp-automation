# LabFlow — onde paramos e para onde vamos (handoff)

Documento para retomar o projeto em outro computador ou numa conversa nova do Claude Code. Leia inteiro antes de propor qualquer coisa. O que está marcado como decidido já foi combinado com o Danyllo; o que está em "a definir" precisa ser perguntado antes de implementar.

Última atualização: 04/10/2026 (módulo de concentrado completo, versão 1.1.0 pronta para publicar).

## 1. Quem sou e como gosto de trabalhar

- Danyllo Gomes, biomédico (microbiologia / controle de qualidade de suco) e estudante de Ciência da Computação. O LabFlow é projeto de portfólio para transição de carreira.
- Sem experiência prévia em PostgreSQL e Power BI: explicar passo a passo, em comandos pequenos, um de cada vez.
- Não sou avançado em n8n: instruções de n8n em passos curtos.
- O Claude faz os commits localmente; eu só envio para o GitHub pelo PowerShell (branch por mudança, Conventional Commits, PR, merge, tag). Nunca editar pelo site do GitHub.
- Mudanças grandes no workflow: o Claude monta o JSON de importação por script, eu importo no n8n **como cópia**, troco o ativo e testo pelo WhatsApp. O arquivo anterior é o rollback.
- Gosto de dicas práticas de mercado/portfólio no meio da ajuda técnica.
- Respostas em português.
- Dados sempre fictícios. Nada real da empresa no repositório, nos testes ou na documentação (LGPD).
- O termo "reanálise" não se usa no projeto. Os D5/D10/D15 são "análises de drop" (ou só "drops").
- **TAB e Coliformes são masculinos** nos textos para o usuário ("O TAB está Incubado", "Os Coliformes estão Estriados"); no banco os status continuam `Incubada`, `Estriada`, `Concluída`.

## 2. Estado atual (04/10/2026)

Versão publicada: **`v1.0.0`** (LabFlow no PostgreSQL; tag e release no GitHub). **A `1.1.0` (módulo de concentrado) está pronta:** os commits estão na branch `feat/concentrado-tab`. Falta: `git push`, abrir o PR, mesclar, `git switch main && git pull` e então `git tag -a v1.1.0` + release (**sempre `git pull` antes de taguear**, ver Bug 30).

Repositório: `github.com/danyllo153/labflow-whatsapp-automation` (público). Clone local: `C:\Dev\labflow-whatsapp-automation`. Notas do projeto no Obsidian (vault `PROJETO- LABFLOW`), incluindo a pasta `Git` com o guia de comandos. Cópia dos arquivos no OneDrive: `Valts\labflow-whatsapp-automation` (o `sync-valts.bat` do notebook copia o projeto para lá).

**Ambiente:** o VPS atual é **demonstração** com dados fictícios, para provar que a automação funciona. Na empresa, servidor, Postgres e Power BI serão os da empresa, com migração e segurança definidas junto com a TI; o LabFlow vai como base. Ideia combinada para depois: um "Guia de implantação do LabFlow" para a TI.

Stack (VPS Linux, stack própria em `~/labflow`, Docker, sem porta pública, acesso só por túnel SSH): WhatsApp Business (número dedicado em eSIM) → Evolution API 2.3.7 (instância `labflow2`) → webhook → n8n 2.38.6 → PostgreSQL → resposta pelo WhatsApp. O mesmo container Postgres guarda o banco da Evolution API e o banco `labflow`. IA: Gemini (`models/gemini-3.1-flash-lite`) como fallback da regex.

**No servidor:** migrations `001` a `010` aplicadas. No n8n está ativo o workflow final (159 nodes). O backup diário (3h, 14 dias, `~/labflow/backups`) está rodando. DBeaver: conexões `LabFlow (leitura)` e `LabFlow (app)` (tipo Production).

**Arquivos de workflow (na pasta do projeto):**
- `LabFlow.json`: versão **pública**, sem IDs reais (vai para o Git).
- `LabFlow_importar_n8n.json`: o workflow final **com IDs reais** (nunca vai para o Git; o `.gitignore` bloqueia `LabFlow_importar_n8n*.json`).
- `LabFlow_importar_n8n_etapa1.json` a `etapa5`: cópias intermediárias da construção do concentrado, também com IDs reais e fora do Git. Podem ser apagadas depois que a 1.1.0 estiver publicada e estável (a `etapa4` é o rollback mais recente).
- Para regerar o público: `scripts\sanitize-workflow.ps1 -Entrada LabFlow_importar_n8n.json -Saida LabFlow.json`, e depois `python scripts/audit-workflow.py LabFlow.json --public` (o Python precisa estar instalado; a GitHub Action roda a auditoria a cada alteração do `LabFlow.json`). Detalhes em [`scripts.md`](scripts.md).
- Cuidado: arquivo `.ps1` com acento sem BOM é lido como Windows-1252 no Windows PowerShell 5.1 e estraga o texto (Bug 29). Scripts em ASCII; texto com acento em arquivos lidos como UTF-8.

**Dados de teste no banco (fictícios):** loads, embarque O.SKY 133, compostas, TABs, Howard, C.T/B.L e coletas dos testes de 02 a 04/10. Limpar pelo DBeaver (`LabFlow (app)`) quando quiser.

## 3. O que o bot faz

**Tanques (NFC):** coleta de terra (até 8 tanques) e de navio (até 16, nome + viagem), com drops D5/D10/D15 e descarte de bag/pote em 365 dias; registro de análise Normal/Stress (CT, BL, WORT) que **exige coleta**; consultas do que vence hoje; conclusão de drops em lote; conclusão de leituras com confirmação "sim/não" (expira em 10 min); bloqueio de coleta duplicada.

**Concentrado (FCOJ), 1.1.0:** recebimento de lotes, compostas (`#N`), TAB de composta e de tanque de NFC, Coliformes (confirmação abrindo a composta lote a lote), embarque (navio + linha + fase, amostras A1..., load antigo é cadastrado na hora), Howard (% par, 50 campos), C.T/B.L por lote e amostra com vários grupos por mensagem e alarme (B.L ≥ 50, C.T ≥ 200). Comandos em [`comandos.md`](comandos.md) (12.1 a 15), desenho em [`concentrado.md`](concentrado.md), arquitetura em [`arquitetura.md`](arquitetura.md).

**Relatório do dia:** `relatório do dia` traz os quatro blocos (FCOJ recebimento, FCOJ embarque, NFC tank farm, NFC navio) numa mensagem, com ✅ lido e 🚨 fora do limite. `relatório do dia completo` traz só o lido, com `ok` / `não ok` nas linhas do concentrado. Filtros por bloco.

**Permissões:** só números cadastrados usam o bot; cargos Admin, Operador, Consultor (Consultor só consulta; só Admin troca cargo). Admin e Operador registram tudo, inclusive resultados.

**IA (V3 parte 1):** mensagem que a regex não reconhece vai ao Gemini, que devolve JSON; o node `Validar resposta da IA` valida e monta o comando padrão; gravações pedem "sim". Permissão é validada no código, nunca no prompt (Bug 23). **A IA ainda não conhece os comandos do concentrado.**

## 4. Roadmap

1. ✅ V1 MVP · ✅ V2 regras de negócio · ✅ V3 parte 1 (IA como fallback) · ✅ V4 (PostgreSQL, 1.0.0) · ✅ módulo de concentrado e relatório diário (1.1.0).
2. ▶ **Próximo (a definir ordem):**
   - Publicar a 1.1.0 (push, PR, merge, `git pull`, tag, release).
   - Relatório diário, fase seguinte: `leitura de hoje finalizada` por analista (barreira contra relatório incompleto, `docs/concentrado.md` seção 7), envio por e-mail e Excel, limites e Situação do Howard e do NFC.
   - IA no concentrado: ensinar o Gemini as intenções novas, com permissão no código e testes de regressão do prompt (uma frase por intenção).
   - Melhoria do "✅ Feito" (Bug 29): só confirmar depois de gravar.
3. V3 parte 2 — IA avançada: comando por áudio (transcrição → mesmo parsing) e leitura de laudo por foto (sempre com confirmação antes de gravar).
4. V5 — Dashboards no Power BI sobre views do Postgres, por usuário somente leitura (Excel foi descartado). Licença: Microsoft 365 Family não inclui o Pro; o Desktop é gratuito para montar e testar.
5. Interface web (LIMS) por último.
6. V6 — documentação e testes, contínuo a cada marco.

Futuro (NÃO fazer agora): integrar a arquitetura de tanques do navio (tanque C/P/S com tonelagem, Load(s)/Item(ns), destino, fase, Linha e TT, o tanque de terra que o encheu; mistura é muitos-para-muitos).

## 5. Banco de dados

Plano e decisões em [`postgres-migracao.md`](postgres-migracao.md); migrations em [`../db/migrations/`](../db/migrations/) (`001` a `010`, aplicadas uma de cada vez, com `-v ON_ERROR_STOP=1`). A coleta é o centro (drops, arquivo e análises apontam para `coleta_id`); no concentrado, a ordem é *recebimento → compostas → testes*. `tanque` é TEXT; datas em `America/Sao_Paulo`; o banco confere as regras de novo (UNIQUE, CHECK, FK). Usuários: `labflow_app` (n8n) e `labflow_leitura` (DBeaver e Power BI). Senhas só em `~/labflow/.env` no servidor.

Aplicar uma migration nova a partir do PC (backup antes: `ssh labflow "cd ~/labflow && ./backup-db.sh"`):

```powershell
cmd /c "type db\migrations\NNN_nome.sql | ssh -o ClearAllForwardings=yes labflow docker exec -i labflow-postgres psql -U labflow_app -d labflow -v ON_ERROR_STOP=1"
```
(`ssh labflow` é um atalho do `~/.ssh/config` que também abre o túnel do n8n e da Evolution; `cmd /c` evita que o PowerShell estrague acentos.)

## 6. Perguntas em aberto e pendências

Respondidas: versão 1.0.0 e 1.1.0; Howard com 50 campos e sem prazo; TAB em 10 dias; Coliformes em 3 dias; quem registra resultado (Admin e Operador); embarque com load e item e sem exigir que o load exista; comandos de C.T/B.L por grupos; alarmes B.L ≥ 50 e C.T ≥ 200; dados de teste recomeçados do zero.

Ainda em aberto:

1. Limites (e Situação `ok`/`não ok`) do Howard e do NFC.
2. Licença do Power BI.
3. Onde guardar uma cópia do `pg_dump` fora do servidor (enquanto os dados forem fictícios, pode ir para o OneDrive).
4. Positivo de TAB/Coliformes entra como "não ok" e 🚨: foi decisão do Claude seguindo o desenho; confirmar com o Danyllo.

## 7. Lições que valem daqui para frente

- Mudanças estruturais no n8n introduzem bugs de conexão: sempre rodar `python scripts/audit-workflow.py LabFlow.json --public` (0 erros).
- Todo ramo precisa terminar em `Respond to Webhook`, senão a Evolution API reenvia a mensagem.
- Node que vem depois de um node com várias linhas precisa de `executeOnce`, senão roda uma vez por linha.
- "Hoje" sempre em `America/Sao_Paulo`.
- Prompt é código: depois de mudar o prompt, reenviar uma frase de cada intenção (regressão).
- Código dos nodes pode ser testado fora do n8n: extrair o `jsCode` do JSON exportado e executar com mensagens de exemplo (no navegador). Pega erro de regex e de texto antes de importar.
- Depois de gerar arquivo por script, procurar caracteres corrompidos (`Ã`, `Â`, `�`) comparando com a versão anterior.
- Antes de taguear: `git switch main && git pull` e conferir com `git log -1`.
- Nunca commitar IDs reais, chaves, telefones reais ou `.env`.
