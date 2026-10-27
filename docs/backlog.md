# Backlog LabFlow

> **Único lugar do "próximo"** (desde 24/10/2026 no repositório; antes ficava no Obsidian). Fases de longo prazo: o `Roadmap-V1-V6` do Obsidian. O que já foi feito, com data: [`CHANGELOG.md`](CHANGELOG.md) e [`handoff-historico.md`](handoff-historico.md). O app tem a bússola própria em [`specs/lims/rumo-do-app.md`](specs/lims/rumo-do-app.md).
> Legenda: 🤖 bot · 📱 app · 🧪 teste ao vivo · 🛠️ infra e piloto · 🎨 portfólio. "(precisa do Danyllo)" = depende de decisão, foto ou ação dele.

## ▶ Próximos passos (arrumado em 24/10/2026) — retomar daqui
> **Estado em 24/10/2026 (tarde):** **v1.4.0 lançada** (23/10). Bot no ar com **263 nós** (`pre79`), banco até a migration **040** do bot e a **064** do app; cargo **Analista** (antes Operador). App com os Marcos 1 a 4, o acabamento visual e os laudos de rastreio no ar. Piloto: por enquanto só o Danyllo testa; dados em dia em lote em 23/10. Detalhe e como publicar: `docs/handoff.md` seção 0 no repositório.

### 🤖 Bot
- [x] **PB10 (dia da incubação) no ar** (24/10, #225, migration 038 aplicada; `bi.incubacao` conferida)
- [x] **PB8 e PB9** feitos (ver abaixo)
- [x] **Resultado do TAB pela foto** (23/10, PR #205): "+" positivo já confirmado, "—" negativo, em branco = caldo; só o novo. Testado ao vivo em 24/10 com a folha do 43701 (#10, #4, #5 negativos), com as correções do aviso de data (#246) e do item lido errado (#247, `pre79`)
- [x] **PB11, funções do recebimento de FCOJ para o app** (24/10, #244, migration 040): `registrar_recebimento` e `lancar_contagem`, com prévia e o mesmo alarme
- [x] **O bot chama a 040** (24/10, migration 041) no recebimento (`BD · Gravar recebimento`) e no lançamento de C.T/B.L, no lugar do SQL próprio (mesma regra do app)
- [x] **PB14, tanques** (24/10, migration 042): coleta, análise, leituras e placas por funções do banco, o bot já usando
- [x] **PB13, compostas, TAB, Coliformes e Howard** (24/10, migration 043), o bot já usando; falta passar as fotos de TAB/Coliformes e o TAB de tanque "completo" pelas funções
- [x] **PB15, drops e desvio de drop** (24/10, migration 044), o bot já usando
- [x] **PB12, embarque** (24/10, migration 045), o bot já usando
- [x] **PB16, recebimento de NFC** (24/10, migration 046), o bot já usando
- [x] **PB17, desvio de tanque, repetição e leitura do dia** (24/10, migration 047), o bot já usando
- [x] **Fase E no bot concluída** (24/10, migration 048, PR aberto): foto de TAB, foto de Coliformes e TAB de tanque "completo" pelas funções do banco; falta aplicar a 048 e publicar
- [x] **PB8 e PB9 no bot** (24/10, migration 049, PR #266): esterilização, água do processo, baias e linhas por frase, pelas funções da 067; 048 e 049 no ar (`pre81`). A regressão na IA está em andamento (25/10: a frase de esterilização passou)
- [x] **Baias e linhas são análise** (25/10, #271, migration 100, primeira da faixa nova 100–149): frase `analisei baia 8,9`, só Admin e Analista, prévia "análise de ..."; no ar (`pre82`)
- [x] **Regressão da IA das frases novas** (25/10): feita pelo Danyllo pelo WhatsApp (esterilização, água, baias e linhas)
- [x] **Apagar o que os testes de 24 e 25/10 gravaram** (25/10, a pedido do Danyllo, sem backup): esterilização 14 e 15 (ciclo A1095/26), água do processo 7 e baias 15 e 16, apagados de vez com trava de contagem
- [x] **TAB do load 43699 gravado à mão** (23/10): 10 compostas positivas confirmadas, feito em 13/10; criadas #87 (1-3) e #88 (4-6)
- [x] **Corrigir resultado de C.T/B.L com um comando curto** (24/10, #240, migration 039, `pre77`): `corrigir ct do load 43755 para <1 motivo ...`; motivo obrigatório para o Analista, opcional para o Admin (#238); testado ao vivo até a prévia
- [x] **Recebimento pelas funções do banco e pelo WhatsApp** (23/10, PRs #197 e #198, migrations 036 e 037, `pre75`): corrigir load/item/fábrica, lote e data, apagar lote (arquiva); testado ao vivo
- [x] **Load de teste 99902 apagado** (25/10, a pedido do Danyllo; backup antes `labflow_2026-10-25_1404.dump`): load, lote 1, a linha do laudo do app, 5 registros do histórico e 1 da lixeira de 23/10
- [x] **PB18, PB19 e PB20 do app** (25/10, #286 e #289, migrations 101, 102 e 103, no ar `pre85`; o Coliformes do embarque fica pendente até o comando): modelo do relatório na doc; embarque com vários loads e itens (`43783/43784`); Coliformes nasce com a composta do embarque e `criar_teste_da_composta` para TAB/Howard; falta testar ao vivo (embarque com dois loads e compostas do navio)
- [x] **Coliformes obrigatório** (regra do Danyllo de 25/10, migration 104, #295): embarque, toda composta; recebimento, a primeira composta de cada load; COL, toda composta; o que já estava no banco não é obrigatório
- [ ] **Relatório do dia numa função do banco** para o bot e o app, contando também água do processo, baias, linhas e esterilização (hoje o bot não conta)
- [ ] **Corrigir resultado (039) numa função geral** (`corrigir_resultado(quem, ...)`) para o app também chamar
- [ ] Registrar por frase o que hoje só o app faz: material asséptico, lote de meio (receber e trocar o em uso) e temperatura das estufas (funções do app)
- [x] **PB21, arquivo de contra-amostras** (25/10, migration 105): caixas, reserva do navio, arquivar o recebimento, descartar com sim, consultas; carga inicial da planilha fora do Git (`C:\Dev\estudos\ia\arquivo`)
- [ ] **PB21 parte 2:** a caixa do recebimento lida pela **foto** da folha e `caixa N` no próprio comando de recebimento
- [x] **PB22, pendências do dia** e **apelidos de navio** (25/10, migration 106): `pendências do dia` no bot, `vw_pendencias_do_dia` para o app; O.BLOSSOM vira o nome oficial (apelido fora do Git)
- [ ] **PB6:** canal `app` no webhook (assistente do app pelo mesmo workflow), só na Fase D do app
- [x] **C.T/B.L do recebimento de FCOJ pela foto** (25/10): lê o resultado de cada lote, traço por cima = já digitado (ignora sem comentar), só o novo, um sim; no ar (#280, `pre83`); o traço marca um bloco; falta testar ao vivo com a folha do load 43599 (lotes 9-20)
- [ ] **Fase seguinte da foto:** o "+" da confirmação (legenda com `confirmação`); TAB/Coliformes de embarque
- [ ] Ajustar o prompt da foto com o que a IA errar nas fotos reais (letra de mão, risco diagonal)
- [ ] **Regressão do prompt de texto:** repetir só as 14 frases que nunca tiveram resposta em 14/10 (46 de 60 acertadas, 0 erradas), em hora calma; depois apagar o workflow de teste do prompt pela tela do n8n
- [ ] Ampliar os testes dos nodes `Montar ...` (texto das respostas)
- [ ] Se as pendências do piloto voltarem a acumular: `C:\Dev\estudos\ia\em-dia-2026-10-23.sql` (ensaio com `-v fim=ROLLBACK`; o `COMMIT` em massa o Danyllo roda no servidor)

### 📱 App (sessão da nuvem)
- [ ] **▶ Testar ao vivo o #339 e o #341** (27/10): marcas "também semanal" no mensal da água de consumo; um laudo físico-químico e um microbiológico (datas entre as barras, traço por bloco); Iniciar análise e No caldo e incubados do TAB e do Coliformes; compostas do navio com TAB/Coliformes/Howard; Desvios da água do processo; várias fábricas no gráfico
- [ ] Publicar o **#341** (Coliformes "para estriar"; só o container), se ainda não foi
- [ ] **Apagar os loads de teste** (33333 e 44444, 4 loads, 54 lotes, 9 compostas): script `~/labflow/apagar_loads_teste.sql` no servidor (fora do Git), com trava de contagem; ensaio com `-v fim=ROLLBACK`, depois `-v fim=COMMIT`, sempre `-d labflow` e com backup antes
- [x] **Ajustes depois do teste de 27/10** (#339, migrations 080 e 081, no ar): água de consumo (mensal com pH e cloro, quem coletou/analisou, laudos semanais pelo modelo), leitura só em Leituras, Desvios da água do processo, TAB/Coliformes com Iniciar análise e No caldo, compostas do navio marcáveis, várias fábricas, painel dos tanques, meios coloridos, apagar de vez a coleta excluída, atividade opcional, estufas em cartões
- [ ] Padronizar as telas (revisão de 26/10, o Danyllo escolhe a ordem): (1) cabeçalho único com ícone colorido, título, subtítulo e "← Análises" também nos Registros diários, Esterilização, Leituras, Arquivo e páginas de dados; (2) gráfico de resultado em Tanques (placas, limite da `limites_nfc`), Coliformes/Howard e Água/Baias/Linhas, tirando o Dashboard de contagem; (3) painel igual em todos os apps (Embarque abre no painel; "Não ok por fábrica/tanque"); (4) laudo sempre numa aba "Laudo"; (5) Imprimir/Excel sempre em ícone, ações da lista como botão ("abrir desvio" igual em Drops e Desvios), abas sublinhadas, cor dos números com regra (vermelho atrasado, laranja atenção, verde ok)
- [ ] Mesclar e publicar o **#322** (cores do gráfico de resultado) quando o Danyllo pedir
- [ ] Limites por análise para o gráfico (NFC recebido, tanques...): o Danyllo passa os valores; tabela com vigência no banco, valores fora do Git
- [x] **Gráficos de resultado com Chart.js** (26/10, #320, no ar): Tendência no Recebimento FCOJ, Embarque e Recebimento NFC; TAB positivos no ano
- [x] **Laudos que faltavam e contra-amostras** (26/10, #316, migration 076, no ar) e **Registros diários só em Análises, busca de load no Arquivo** (#315, no ar)
- [ ] **"Análises a fazer hoje" com as pendências**, não só as leituras: TAB/Coliformes no caldo para espalhar/estriar, confirmatório, composta esperando TAB/Coliformes (obrigatório da 104), Stress de tanque e o atrasado de outro turno em vermelho (pedido de 25/10, detalhe no rumo)
- [x] **Esterilização com ícone e cor** em cada material (ponteira, meio, frasco, água de diluição, descarte, outro; pedido de 25/10)
- [x] **Página Arquivo** (caixas, vencido em vermelho, arquivar e descartar) e os **laudos por caixa** (25 e 26/10, #305 e #316), pela migration 105 do bot
- [x] **Pedidos de 25/10 (29 itens) e o visual novo** (APP-065 a APP-067, #282, #283 e a leva 3): menu escuro com ícones, Análises com ícone e cor
  por família, Excel/Imprimir em ícone, IT, atividades com a caixa, TAB/Coliformes/Howard separados, Wort numa linha, compostas no Registrar,
  sininho, <10 no FCOJ, Relatório do dia, Dashboard, branco automático, incubação sem lotes; no ar em 25/10 (`6c041c3`, com o #285)
- [x] **Laudos novos** (26/10, #316, migration 076; modelos recebidos em 25/10; detalhe na tabela "Laudos automáticos" do rumo): Recebimento NFC (mesmo modelo do FCOJ, item 129), NFC de tanques e navios, Embarque, TAB, Coliformes e Howard; drops e estufas não têm laudo
- [x] Mostrar como pendência só o **Coliformes obrigatório** (27/10, #339: o Para fazer conta o que cada composta pede) (`vw_coliformes_pendentes.obrigatorio`, migration 104 do bot)
- [ ] **Recuperar lote apagado do recebimento** pelo Admin (`recuperar_recebimento`, 036)
- [x] **TAB / Coliformes / Howard** marcáveis na composta do embarque (27/10, #339, `app.compostas_testes`)
- [ ] Relatório do dia no formato do relatório diário do bot, quando o bot responder o PB18
- [ ] Embarque com vários loads/itens na tela, quando o bot fizer o PB19
- [x] **Compostas no Recebimento FCOJ** (24/10, APP-058): recomendado de ~5 por composta e prévia
- [x] **Laudo do Recebimento FCOJ** (24/10, APP-059, migration 070): como o papel (deitado, um lote por linha, faltantes com *), envio do modelo na aba Laudo
- [ ] **Arquivo de amostras** (bot e app): caixa de cada load ("CX: 128" na Observação do laudo), bags, potes, recebimento e embarque
- [x] **Aviso de amostra pulada** (24/10, APP-059): na prévia do registro e no Painel do Recebimento, até o lote chegar; sem "finalizar load" (decisão de 24/10)
- [x] **Fase E, E3 a E8** (24/10, APP-061): apps de Tanques, TAB/Coliformes/Howard, Drops, Embarque, Recebimento NFC e Desvios, pelas funções da 042 a 047
- [x] **E9, Instrução e vídeo** (24/10, APP-062, migration 071): abas Instrução e Vídeo em todos os apps; o Admin escreve a instrução e cola o link do vídeo (versões no banco)
- [ ] Escrever a instrução de cada app no app, como Admin (o Danyllo vai escrever, combinado em 26/10); os vídeos serão feitos depois por IA a partir dela
- [x] Botões dos destaques do Início ligados aos apps novos (24/10): "Espalhei todos", "Lançar leituras" etc. abrem o app na aba certa, com a lista marcada e o Confirmar
- [x] **Fase E, E1 e E2** (24/10, APP-057, migration 068): Páginas como tela de apps e o Recebimento FCOJ como app (painel, registrar e lançar pelas funções da 040). Próximo: E3 em diante, um app por análise, conforme o bot entregar PB12 a PB17
- [x] **Marcos 3 e 4 mesclados** (23/10): turno com atividades fixas, relatório e encerrar (#181, #183, #185), esterilização com o G4 (#188), estufas (#189), Admin de turnos/atividades/estufas (#190) e **corrigir/excluir/recuperar coleta pelo app** (APP-029, #191)
- [x] Marcos 3 e 4, acabamento visual (APP-030 a APP-034), laudo de esterilização (APP-035) e os laudos de rastreio (APP-036 a APP-043) **no ar** no servidor (23 e 24/10, migrations 054 a 064)
- [x] **APP-040, laudo de incubação e leitura** no ar (#231, migration 065), no padrão de escrita do laboratório (#233), com o lote de cada dia sozinho (#234) e a correção da data do lote em uso (#235)
- [x] **Material asséptico:** resultado pendente, "<1 em todos" e excluir dia (#236, migration 066), no ar
- [x] **Visual repaginado** no ar (#228, 24/10): menu claro, Inter, avatar, botões em pílula, blocos coloridos
- [x] **Visual, parte 2** (APP-055, 24/10): gráfico da semana, cartão das folhas no menu, largura toda e blocos mais suaves no escuro
- [x] **Início e Turno no layout do canvas** (APP-056, 24/10): cartão "Agora", destaques do dia, equipe e estufas lado a lado, "Quem fez o quê" com filtro
- [x] **▶ Fase E, o app faz tudo o que o bot faz** (pedido de 24/10): tela de apps com a busca e o filtro (E1 ✔) e Recebimento FCOJ completo (E2 ✔, #253); E3 a E8 (#264) e E9 (APP-062) feitos em 24/10. Plano e tabela "bot × app" no rumo-do-app, seção "Fase E"
- [x] Botões que gravam em lote nos destaques: abrem o app com a lista toda marcada e o "Confirmar" (decisão de 24/10)
- [x] **Drops e leituras de tanque todos marcados** e **baias e linhas só Admin e Analista** (25/10, APP-063, migration 072,
  com o GRANT das funções da 048 pedido pela sessão do bot; #272 mesclado); conferir se a 072 foi publicada (pedida à sessão do bot)
- [x] **Histórico de lotes importado** pelo Danyllo (24/10; 30 lotes de meio no app)
- [x] **Modelos em PDF dos laudos enviados** pelo Danyllo (23/10: esterilização, material asséptico, meios de cultura, fluxo laminar, limpeza de superfícies e água do processo)
- [x] **Editar e excluir clicando no app:** coletas (APP-029) e recebimento de FCOJ (migration 064, funções 036), com histórico e recuperar pelo Admin
- [x] **App no celular** pelo Tailscale e na tela inicial, em uso pelo Danyllo (conferido em 24/10)
- [x] Acabamento visual do app (APP-030 a APP-032: ícones, etiquetas, modo escuro, layout profissional)
- [ ] Ideia para depois do piloto: importar do Excel com "antes → depois" no app (tudo pelas funções, com histórico)
- [ ] Futuro: **barreiras de segurança no celular** (localização da fábrica, horário do turno, aparelho autorizado, nada guardado no aparelho; aviso de LGPD antes de ligar), depois do piloto do app

### 🧪 Testes ao vivo (pelo WhatsApp)
- [x] **Foto da folha de TAB com resultado** do load **43701** depois da leitura: testada pelo Danyllo em 24/10, tudo certo
- [ ] Foto de **embarque com resultados** (grava só se o embarque existe; riscado não vale)
- [ ] Foto de **NFC com placa acima do limite** (ver o 🚨 e o comando de desvio)
- [ ] Testar o **Coletor** com um celular real
- [x] **Perguntar ao laboratório** se "10 x 3" ou outra notação aparece na diluição: não escrevem (Danyllo, 26/10); nada a fazer

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
