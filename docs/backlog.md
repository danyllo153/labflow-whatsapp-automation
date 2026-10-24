# Backlog LabFlow

> **Único lugar do "próximo"** (desde 24/10/2026 no repositório; antes ficava no Obsidian). Fases de longo prazo: o `Roadmap-V1-V6` do Obsidian. O que já foi feito, com data: [`CHANGELOG.md`](CHANGELOG.md) e [`handoff-historico.md`](handoff-historico.md). O app tem a bússola própria em [`specs/lims/rumo-do-app.md`](specs/lims/rumo-do-app.md).
> Legenda: 🤖 bot · 📱 app · 🧪 teste ao vivo · 🛠️ infra e piloto · 🎨 portfólio. "(precisa do Danyllo)" = depende de decisão, foto ou ação dele.

## ▶ Próximos passos (arrumado em 24/10/2026) — retomar daqui
> **Estado em 24/10/2026 (tarde):** **v1.4.0 lançada** (23/10). Bot no ar com **263 nós** (`pre79`), banco até a migration **040** do bot e a **064** do app; cargo **Analista** (antes Operador). App com os Marcos 1 a 4, o acabamento visual e os laudos de rastreio no ar. Piloto: por enquanto só o Danyllo testa; dados em dia em lote em 23/10. Detalhe e como publicar: `docs/handoff.md` seção 0 no repositório.

### 🤖 Bot
- [x] **PB10 (dia da incubação) no ar** (24/10, #225, migration 038 aplicada; `bi.incubacao` conferida)
- [ ] **PB8** (esterilização por frase) e **PB9** (água, baias e linhas por frase): as funções do banco do app estão no PR do APP-054 (migration 067); falta o bot usar (rumo-do-app, "Funções do app para o PB8 e o PB9")
- [x] **Resultado do TAB pela foto** (23/10, PR #205): "+" positivo já confirmado, "—" negativo, em branco = caldo; só o novo. Testado ao vivo em 24/10 com a folha do 43701 (#10, #4, #5 negativos), com as correções do aviso de data (#246) e do item lido errado (#247, `pre79`)
- [x] **PB11, funções do recebimento de FCOJ para o app** (24/10, #244, migration 040): `registrar_recebimento` e `lancar_contagem`, com prévia e o mesmo alarme
- [ ] **▶ O bot chamar a 040** no recebimento (`BD · Gravar recebimento`) e no lançamento de C.T/B.L, no lugar do SQL próprio (mesma regra do app)
- [ ] **Fase E, próximas funções do banco** (pedido do app, #243): PB14 tanques (041), PB13 compostas/TAB/Coliformes/Howard (042), PB15 drops (043), PB12 embarque (044), PB16 NFC recebido (045), PB17 desvios e leitura do dia (046)
- [x] **TAB do load 43699 gravado à mão** (23/10): 10 compostas positivas confirmadas, feito em 13/10; criadas #87 (1-3) e #88 (4-6)
- [x] **Corrigir resultado de C.T/B.L com um comando curto** (24/10, #240, migration 039, `pre77`): `corrigir ct do load 43755 para <1 motivo ...`; motivo obrigatório para o Analista, opcional para o Admin (#238); testado ao vivo até a prévia
- [x] **Recebimento pelas funções do banco e pelo WhatsApp** (23/10, PRs #197 e #198, migrations 036 e 037, `pre75`): corrigir load/item/fábrica, lote e data, apagar lote (arquiva); testado ao vivo
- [ ] Apagar o load de teste **99902** (id 46, lote 1) e o que o teste ao vivo de 23/10 deixou no histórico e no arquivo, se quiser (precisa do Danyllo)
- [ ] **PB6:** canal `app` no webhook (assistente do app pelo mesmo workflow), só na Fase D do app
- [ ] **Fase seguinte da foto:** C.T/B.L do recebimento por lote (precisa do Danyllo: uma foto de recebimento preenchida com resultados); o "+" da confirmação (legenda com `confirmação`); TAB/Coliformes de embarque
- [ ] Ajustar o prompt da foto com o que a IA errar nas fotos reais (letra de mão, risco diagonal)
- [ ] **Regressão do prompt de texto:** repetir só as 14 frases que nunca tiveram resposta em 14/10 (46 de 60 acertadas, 0 erradas), em hora calma; depois apagar o workflow de teste do prompt pela tela do n8n
- [ ] Ampliar os testes dos nodes `Montar ...` (texto das respostas)
- [ ] Se as pendências do piloto voltarem a acumular: `C:\Dev\estudos\ia\em-dia-2026-10-23.sql` (ensaio com `-v fim=ROLLBACK`; o `COMMIT` em massa o Danyllo roda no servidor)

### 📱 App (sessão da nuvem)
- [x] **Marcos 3 e 4 mesclados** (23/10): turno com atividades fixas, relatório e encerrar (#181, #183, #185), esterilização com o G4 (#188), estufas (#189), Admin de turnos/atividades/estufas (#190) e **corrigir/excluir/recuperar coleta pelo app** (APP-029, #191)
- [x] Marcos 3 e 4, acabamento visual (APP-030 a APP-034), laudo de esterilização (APP-035) e os laudos de rastreio (APP-036 a APP-043) **no ar** no servidor (23 e 24/10, migrations 054 a 064)
- [x] **APP-040, laudo de incubação e leitura** no ar (#231, migration 065), no padrão de escrita do laboratório (#233), com o lote de cada dia sozinho (#234) e a correção da data do lote em uso (#235)
- [x] **Material asséptico:** resultado pendente, "<1 em todos" e excluir dia (#236, migration 066), no ar
- [x] **Visual repaginado** no ar (#228, 24/10): menu claro, Inter, avatar, botões em pílula, blocos coloridos
- [x] **Visual, parte 2** (APP-055, 24/10): gráfico da semana, cartão das folhas no menu, largura toda e blocos mais suaves no escuro
- [ ] Botões rápidos nos blocos do Início (ex.: "Espalhei todos"): gravam em lote, então pedem decisão do Danyllo sobre a confirmação antes
- [x] **Histórico de lotes importado** pelo Danyllo (24/10; 30 lotes de meio no app)
- [x] **Modelos em PDF dos laudos enviados** pelo Danyllo (23/10: esterilização, material asséptico, meios de cultura, fluxo laminar, limpeza de superfícies e água do processo)
- [x] **Editar e excluir clicando no app:** coletas (APP-029) e recebimento de FCOJ (migration 064, funções 036), com histórico e recuperar pelo Admin
- [x] **App no celular** pelo Tailscale e na tela inicial, em uso pelo Danyllo (conferido em 24/10)
- [x] Acabamento visual do app (APP-030 a APP-032: ícones, etiquetas, modo escuro, layout profissional)
- [ ] Ideia para depois do piloto: importar do Excel com "antes → depois" no app (tudo pelas funções, com histórico)
- [ ] Futuro: **barreiras de segurança no celular** (localização da fábrica, horário do turno, aparelho autorizado, nada guardado no aparelho; aviso de LGPD antes de ligar), depois do piloto do app

### 🧪 Testes ao vivo (pelo WhatsApp)
- [ ] **Foto da folha de TAB com resultado** (no ar desde 23/10): mandar a folha do load **43701** depois da leitura (fica para **25/10**) (esperado: "+" positivo confirmado, "—" negativo, uma mensagem, um sim)
- [ ] Foto de **embarque com resultados** (grava só se o embarque existe; riscado não vale)
- [ ] Foto de **NFC com placa acima do limite** (ver o 🚨 e o comando de desvio)
- [ ] Testar o **Coletor** com um celular real
- [ ] **Perguntar ao laboratório** se "10 x 3" ou outra notação aparece na diluição (hoje não é aceita)

### 🛠️ Infra e piloto
- [ ] **Power BI online com gateway** (decidido 16/10, precisa do Danyllo): no desktop, publicar o `.pbip` em "Meu workspace" (conta da faculdade), instalar o gateway em modo pessoal, credenciais do `labflow_leitura` e atualização agendada (até 8/dia); ver pelo app.powerbi.com e pelo app do celular. Não compartilhar nem "Publicar na Web". Na migração para a empresa, apagar o painel e o modelo publicados junto com a limpeza dos dados. **Não salvar** o `.pbip` depois de abrir (o Desktop tira o `$schema` dos arquivos)
- [ ] **Domínio próprio** antes do piloto do app (precisa do Danyllo)
- [ ] **Plano pago do Gemini** com teto de gasto (o 503 do plano gratuito oscila) e painel de uso da IA (decisão do Danyllo)
- [ ] **Cópia do backup para fora do servidor:** semanal para `C:\Dev\backups-labflow` (ou OneDrive) e guardar a mensagem escrita do gestor
- [ ] **Fim do piloto (~13/11/2026):** `fim-do-piloto.sh` e apagar os backups, só com a confirmação do Danyllo
- [ ] Apagar a branch local antiga `docs/handoff-piloto` (2 commits de 13/10 que nunca viraram PR, superados pelo handoff atual), se não precisar
- [ ] Arquivar a planilha do Google Sheets quando o plano B (workflow antigo) não for mais necessário
- [ ] Repo: padronizar autor dos commits e prefixo de branch (`feat/` vs `feature/`)
- [ ] Skills do Claude: `/novo-comando`; hook de pré-commit (acento corrompido, ID real, `.env`); ferramenta de migration (`dbmate`)

### 🎨 Portfólio
- [ ] Refazer os prints e o GIF do painel (modo claro, 10 páginas) e o carrossel do LinkedIn; postar no LinkedIn com os GIFs do README
- [ ] Vídeo/GIF do bot no README e seção "Como usei IA neste projeto"

## Especificação do LIMS (Spec-Driven Development)
- [ ] Refinar os documentos de [Especificação do LIMS](specs/lims/index.md) até `v1.0`, na ordem do `index.md`. As specs da Fase 1 (02 audit trail, 03 especificações, 04 liberação, 05 migrations) estão em v0.2; perguntas abertas que travam a v1.0: o que é *cliente* numa especificação, limites oficiais restantes, cargo Revisor, prazo de resultado ruim parado, retenção da auditoria, dbmate
- [ ] Com cada documento `v1.0`, gerar as tarefas (`LIMS-001`...) pelas regras do `guia-pratico.md`

## Fase 1 — Base de LIMS no banco (ISO/IEC 17025)
- [ ] **Audit trail**: tabela `auditoria` por triggers (quem, quando, tabela, valor antigo e novo). Já existe o `historico_alteracoes` das coletas (033)
- [ ] **Especificações**: limites por análise × produto/item/cliente, substituindo os limites fixos (B.L ≥ 50, C.T ≥ 200)
- [ ] **Revisão e liberação**: lançado → revisado → liberado, aprovação por outra pessoa *(a decidir: só Admin ou cargo novo?)*

## Fases 2 a 6 (detalhes no Roadmap-V1-V6 do Obsidian)
- [x] Fase 2 — API própria: **FastAPI** + login, começando só leitura, acesso pelo **Tailscale** (no ar desde 19/10, Fase B do app)
- [x] Fase 3 — Plataforma própria (web e celular, **React + TypeScript**): login, páginas, pendências e o turno (Fases C do app, em andamento); o WhatsApp continua como canal
- [ ] Fase 4 — Escrita pelo app (chat com o mesmo pipeline do n8n, depois formulários) = Fase D do app e o PB6
- [x] Fase 5 — IA avançada: **áudio** e **foto de laudo**, sempre com confirmação (no ar desde a v1.3.0)
- [ ] **RAG das instruções de trabalho** (IA responde citando o documento em vigor; documentos no servidor da empresa) e **laudo preenchido automaticamente** a partir dos resultados (proposta enviada ao gerente em 08/10)
- [ ] Fase 6 — Extras de LIMS: laudo PDF, meios/reagentes, equipamentos, QR code, não conformidades, Arquitetura-Navio-Futura
- [ ] Power BI no ambiente da empresa (Pro + gateway), quando o laboratório pedir, com a TI
- [ ] Guia de implantação do LabFlow para a TI da empresa

## Ideias (sem data)
- [ ] E. coli e Coliformes de amostras fora do concentrado (Coliformes-Ecoli)
- [ ] Monitoramento ambiental (Listeria / Salmonella / Agua-Processo) — exige cadastro de "pontos de coleta"

## Baixa prioridade (avaliado e descartado por ora)
- Controles-Equipamento — pelo WhatsApp, não; no app, esterilização, material asséptico, fluxo laminar e estufas já existem (falta Sanitização TMG e Troca de Filtros)

## ✅ Feito (resumo; detalhe com data e motivo no decisoes-log)
- **23/10:** v1.4.0 lançada (#186); Operador → Analista (PB7, #182, migration 035, `pre74`) e a 053 do app (check-in); pergunta curta do `tq` sem coleta (#171, `pre73`, testada ao vivo); Excel com a cara do Power BI (#166, também no PC); dados do piloto postos em dia em lote (sem leitura real; fora o recebimento NFC)
- **22/10:** corrigir/apagar coleta pelo WhatsApp com as funções do banco (#156, `pre72`; apagar arquiva), testado ao vivo; skill `bom-dia` com a hora de Brasília (#161)
- **21/10:** PB5 e PB1 no ar (#84 e #82, migrations 031 e 030); PB4 parte 1, Coletas (033 e 034); respostas das fotos objetivas (#144, `pre71`); backup do banco corrigido (#135); Excel só de leitura (#152); túnel permanente e psqlODBC no notebook; foto de TAB com tanques só com o novo (#131, `pre69`); Coliformes sem os avisos de barulho (#129, `pre68`); app: Marco 1 (APP-012 a APP-016, migration 051)
- **19 a 23/10, app:** Fase B no ar (APP-001 a APP-011, API pelo Tailscale); Marco 2 (APP-017 a APP-020, todas as páginas do Power BI e o gráfico G2); Marco 3 começado (APP-021, APP-022 e APP-022b, migrations 052 e 053)
- **19/10:** Coliformes pela foto com resultado em branco (#123, `pre67`), testado ao vivo; as Actions seguem verdes depois da troca para o Ubuntu 26
- **16 e 17/10:** folha de Coliformes pela foto (#118, `pre66`); recebimento NFC só com o novo (#105, `pre65`); TAB de tanque "completo" (#101, `pre64`); mensagem repetida descartada e NFC com o número do laudo (#94, migration 032); "todos" de uma vez e leitura antecipada (#88, `pre63`); Admin abre composta pelo TAB/Coliformes (#86, #90)
- **15/10:** v1.3.0 lançada (#80); Recebimento NFC no ar (migration 027); "coletado por" e cargo Coletor (migrations 028 e 029); teste do Coletor limpo
- **14/10:** IA resiliente (Gemini → Groq, limite diário, migration 020); leitura de laudo por foto (#47 a #53); ajuda completa (#43); fala com vírgula e milhar (#44); dados de teste apagados e `ORANGE SKY 189` unificado no `O.SKY 189`
- **13/10:** piloto de 1 mês no ar (autorizado pelo gestor), Guia-de-uso-do-bot entregue, Caderno-do-piloto; melhoria das placas importada (#40); monitor externo (healthchecks.io)
- **Até 09/10:** v1.2.0 (NFC placa a placa, desvio de tanque, relatório com ok/não ok), comando por áudio, painel em modo claro, alerta de erro no WhatsApp, Actions na v7, `CLAUDE.md`, testes dos Code nodes, regressão do prompt (`scripts/gerar-teste-prompt-ia.js`)
