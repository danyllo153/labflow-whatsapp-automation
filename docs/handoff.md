# LabFlow — onde paramos e para onde vamos (handoff)

Documento para retomar o projeto em outro computador ou numa conversa nova do Claude Code. Leia inteiro antes de propor qualquer coisa. O que está marcado como decidido já foi combinado com o Danyllo; o que está em "a definir" precisa ser perguntado antes de implementar.

Última atualização: 30/09/2026 (fim do dia: migração para o Postgres, backup e DBeaver).

## 1. Quem sou e como gosto de trabalhar

- Danyllo Gomes, biomédico (microbiologia / controle de qualidade de suco) e estudante de Ciência da Computação. O LabFlow é projeto de portfólio para transição de carreira.
- Sem experiência prévia em PostgreSQL e Power BI: explicar passo a passo, em comandos pequenos, um de cada vez.
- Não sou avançado em n8n: instruções de n8n em passos curtos, um node por vez.
- O Claude adianta os commits; eu só envio para o GitHub pelo PowerShell (branch por mudança, Conventional Commits, PR, merge). Nunca editar pelo site do GitHub.
- Enquanto iteramos nos nodes, mandar só o código/prompt do node como texto. O `LabFlow.json` completo e o JSON de importação só quando eu pedir.
- Gosto de dicas práticas de mercado/portfólio no meio da ajuda técnica.
- Respostas em português.
- Dados sempre fictícios. Nada real da empresa no repositório, nos testes ou na documentação (LGPD).
- O termo "reanálise" não se usa no projeto (reanálise seria analisar a mesma coisa 2x, e isso não acontece). Os D5/D10/D15 são "análises de drop" (ou só "drops").

## 2. Estado atual (30/09/2026)

Versão publicada: `v0.9.0` (tag no commit de merge `a9d6a1e`, PR #2 mesclado).
Repositório: `github.com/danyllo153/labflow-whatsapp-automation` (público). Clone local no PC principal: `C:\Dev\labflow-whatsapp-automation`. Notas do projeto no Obsidian (vault `PROJETO- LABFLOW`), incluindo uma pasta `Git` com guia de comandos. Cópia dos arquivos no OneDrive: `Valts\labflow-whatsapp-automation`.

**Fim do dia 30/09/2026:** workflow no Postgres mesclado na `main` (PR #6). Branch aberta: `chore/backup-db` (script de backup + este handoff) — enviar com `git push -u origin chore/backup-db`, abrir PR e mesclar. A versão publicada ainda é a `v0.9.0`: a migração ainda não tem número de versão nem CHANGELOG (decidir 0.10.0 ou 1.0.0; recomendação: 1.0.0).

**Ambiente:** o VPS atual é **demonstração** com dados fictícios, para provar que a automação funciona. Na empresa, servidor, Postgres e Power BI serão os da empresa, com migração e segurança definidas junto com a TI; o LabFlow vai como base. Ideia combinada para depois: um "Guia de implantação do LabFlow" para a TI.

### Backup do banco — feito em 30/09/2026

- `scripts/backup-db.sh` copiado para `~/labflow/backup-db.sh` no servidor; `cron` todo dia às 3h (servidor no fuso -03); guarda 14 dias em `~/labflow/backups` (pasta `700`, arquivos `600`); log em `backups/backup.log`.
- Testado: backup gerado (24K) e validado com `pg_restore --list` (7 tabelas). Restaurar: ver `docs/scripts.md`.
- Falta: copiar de vez em quando um `.dump` para fora do servidor (`scp`); como os dados são fictícios, pode ir para o OneDrive.

### DBeaver — configurado em 30/09/2026

- Conexão `LabFlow (leitura)` (usuário `labflow_leitura`) funcionando, via túnel SSH (host `172.16.2.2`, IP interno do container; muda se o container for recriado).
- Falta criar `LabFlow (app)` (usuário `labflow_app`, tipo de conexão **Production** para pedir confirmação antes de gravar) e dar a lição de `UPDATE`/`DELETE`.
- Aulas de SQL já dadas: `SELECT`, `WHERE`, `ORDER BY` (DESC em data = mais recente primeiro), `JOIN`, `GROUP BY`/`count`. Cola no Obsidian: nota `SQL-e-DBeaver`.

### Migração para o Postgres — feita e testada em 30/09/2026 (noite)

- **No servidor:** banco `labflow`, usuários `labflow_app` (n8n) e `labflow_leitura` (Power BI/DBeaver), fuso `America/Sao_Paulo`, `001_tanques.sql` aplicada. Senhas só em `~/labflow/.env` (ver nota `Postgres-Migracao` no Obsidian).
- **No n8n:** workflow novo `LabFlow (Postgres)` **ativo**; o antigo (Sheets) **desativado** e guardado para voltar atrás (desativar o novo e ativar o antigo). Os dois usam o caminho `labflow-registro` e não podem ficar ativos juntos.
- **Sem nenhum node do Google Sheets.** 22 nodes Postgres, sempre com parâmetros (`$1`, `$2`...). Coleta grava coleta + drops + bag/pote numa instrução só. Análise **exige coleta** do tanque até a data da análise (decidido). Expiração do "sim" calculada pelo banco.
- **Organização:** 8 blocos coloridos (entrada, consultas, coletas, análise, concluir, sim/não, IA, cargos) e nomes padronizados: `BD ·` banco, `Zap ·` envia no WhatsApp, `Fim ·` responde ao webhook, `Montar resposta ...` formata texto.
- **Testado pelo WhatsApp (todos ok):** drops de hoje; coleta + duplicata; análise com e sem coleta; consulta de análises; concluir leitura com "sim"; concluir drops D5; trocar cargo; frase livre pela IA com "sim" e com "não".
- **Bugs encontrados (registrar no troubleshooting):**
  - `If IA Entendeu.` e `If Reenviar Comando.` comparavam texto fixo e eram sempre verdadeiros (podiam apagar uma confirmação de leitura pendente). Corrigidos.
  - Ao duplicar o workflow, o n8n troca o caminho do webhook por um código aleatório; o reenvio da IA iria para o workflow antigo. Voltou para `labflow-registro`.
  - Referência a node com nome em caixa diferente (`Checar Duplicata Terra` x `Checar duplicata terra`): a coleta gravava, a resposta falhava e a Evolution reenviava a mensagem, que voltava como "já registrada".
  - Telefone cadastrado com `0` na frente: o bot respondia "não cadastrado". Formato certo: o mesmo de `_numeroRemetenteLimpo` (só dígitos, DDI 55, sem zero).
- **Dados de teste no banco (fictícios):** coletas terra 42–47, análises dos tanques 44 e 45, usuário `5511900000001` (Teste, Operador). Limpar quando quiser.
- **Próximos passos, em ordem:**
  1. Mesclar o PR da `chore/backup-db`.
  2. Documentação: troubleshooting (bugs da virada acima), `arquitetura.md` e `comandos.md` (Postgres no lugar do Sheets, nomes novos dos nodes), README, CHANGELOG + tag (versão a decidir; recomendação 1.0.0).
  3. DBeaver: conexão `LabFlow (app)` e lição de `UPDATE`/`DELETE`; usar para limpar os dados de teste.
  4. Módulo de concentrado (`002_concentrado.sql`): recebimento, embarque, TAB, Coliformes, Howard — perguntas em aberto na seção 8.
  5. Depois: Power BI (V5) e IA avançada (V3 parte 2).

Stack em produção de teste (VPS Linux, stack própria em `~/labflow`, Docker, sem porta pública, acesso só por túnel SSH):

- WhatsApp Business (número dedicado em eSIM) → Evolution API 2.3.7 (instância `labflow2`) → webhook → n8n 2.38.6 → Google Sheets (conta de serviço) → resposta pelo WhatsApp.
- Já existe um container Postgres na stack, hoje usado pela Evolution API.
- IA: Gemini (`models/gemini-3.1-flash-lite`) como fallback da regex.

O que o bot já faz (tudo sobre Google Sheets):

- Coleta de tanque terra (até 8 tanques por mensagem) e navio (até 16, nome + viagem, ex.: "O.SKY 123").
- Cálculo automático de drops D5/D10/D15 e da data de descarte do bag (terra) / pote (navio) = coleta + 365 dias.
- Registro de análise Normal ou Stress: 4 linhas por tanque → CT Profundidade (leitura final 48h), BL Profundidade (pré 72h, final 120h), WORT Profundidade e WORT Superfície (pré 120h, final 240h). Campo único `Status` por linha: Aguardando Pré-Leitura → Aguardando Leitura Final → Concluído.
- Consultas: drops de hoje, análises terra/navio que saem hoje (agrupadas por sub-análise + prazo em horas + frasco; WORT Prof./Sup. juntos), bags e potes para descartar hoje.
- Conclusão de drops em lote; conclusão de leituras com confirmação "sim/não" (aba `CONFIRMACOES_PENDENTES`, expira em 10 min), gravando quem leu (`Pre-Leitura Feita Por`, `Leitura Final Feita Por`).
- Leituras concluídas continuam aparecendo na consulta do dia (decidido: serve para montar lista por e-mail).
- Permissões: só números cadastrados usam o bot; cargos Admin, Operador, Consultor (Consultor só consulta; só Admin troca cargo, inclusive o próprio).
- Bloqueio de coleta duplicada (mesmo tanque + mesma data; no navio considera o navio).
- IA (V3 parte 1, concluída): mensagem que a regex não reconhece vai ao Gemini, que devolve JSON; o node `Validar IA` valida e monta o comando padrão; gravações pedem "sim" e o comando volta ao próprio webhook para a regex executar. Consultas e concluir leitura vão direto. Permissão e cargo são validados no código, nunca no prompt (Bug 23: IA trocava "gerente" por Admin). Ajuda por assunto sem IA ("comandos para drops", "consultar análises").

Abas atuais do Google Sheets: `COLETAS_TERRA`, `COLETAS_NAVIO`, `DROPS` (terra e navio juntos, com Tipo Tanque/Navio), `BAGS_TERRA`, `POTES_NAVIO`, `ANALISES` (ID, ID Coleta, Tanque, Tipo Tanque, Navio, Tipo Frasco, Sub-Analise, Metodo, Data Analise, Data Pre-Leitura, Data Leitura Final, Status, Responsavel, Pre-Leitura Feita Por, Leitura Final Feita Por), `USUARIOS` (Numero, Nome, Nivel), `CONFIRMACOES_PENDENTES` (Numero, IDs, NovosStatus, Resumo, Criado Em).

Ferramentas do repositório: `scripts/audit-workflow.py` (órfãos, HTTP sem Respond to Webhook — com exceção para chamada ao próprio webhook —, placeholders, dados sensíveis com `--public`) + GitHub Action que roda a cada mudança do `LabFlow.json`. Dois arquivos de workflow: `LabFlow.json` (sanitizado, vai para o Git) e `LabFlow_importar_n8n.json` (IDs reais, nunca vai para o Git).

Docs: `README.md`, `docs/comandos.md`, `docs/arquitetura.md`, `docs/troubleshooting.md` (24 bugs; faltam os da virada), `docs/deploy-vps.md`, `docs/scripts.md` (audit-workflow e backup-db), `docs/CHANGELOG.md`, `docs/postgres-migracao.md`, `docs/handoff.md`. Atenção: arquitetura e comandos ainda descrevem o Google Sheets.

Pendências pequenas (as de antes da migração já foram feitas: `.gitignore`, branch remota apagada, Bug 22 revisado):

- Opcional: release `v0.9.0` no GitHub; testes de regressão do prompt do Gemini; segundo modelo de reserva.

## 3. Ordem do roadmap (decidida em 25/09, revisada)

1. ✅ V1 MVP · ✅ V2 regras de negócio · ✅ V3 parte 1 (IA como fallback, sobre o Sheets).
2. ▶ Próximo: V4 — migração Google Sheets → PostgreSQL, implementando junto recebimento e embarque de suco concentrado (com TAB, Coliformes e Howard), já direto no schema final (sem planilha intermediária).
3. V3 parte 2 — IA avançada sobre o Postgres: comando por áudio (transcrição → mesmo parsing) e leitura de laudo por foto (sempre com confirmação antes de gravar), cobrindo tanques e concentrado.
4. V5 — Dashboards no Power BI sobre o Postgres (Excel foi descartado).
5. Interface web (LIMS) por último.
6. V6 — documentação e testes, contínuo a cada marco.

## 4. Migração para PostgreSQL

O detalhe do plano, das decisões de design e dos passos do servidor está em [`postgres-migracao.md`](postgres-migracao.md), e o schema em [`../db/migrations/`](../db/migrations/). Resumo:

- Cada aba vira tabela; a coleta é o centro (drops, arquivo e análises apontam para ela por `coleta_id`).
- O fluxo do bot continua igual para o usuário (mesmos comandos, mesmas respostas); troca-se a camada de dados (nodes Google Sheets → nodes Postgres).
- Regras que hoje estão em código vão para o banco: duplicata (`UNIQUE`), valores válidos (`CHECK`), integridade (`FOREIGN KEY ... ON DELETE CASCADE`), índices por data/status.
- Regex continua primeira tentativa; IA só como fallback; "a IA sugere, o código valida" vale igual no banco.
- `tanque` é TEXT (terra é número, navio é código tipo "1C", "4P").
- Datas/horas em `America/Sao_Paulo` (já houve bug de UTC no container).
- COLETAS_NAVIO fica como está (decidido): não adicionar agora colunas da arquitetura do navio.

Passos, cada um numa branch e PR:

1. Criar o banco `labflow` no Postgres da stack (separado do da Evolution API), com usuário da aplicação e outro somente leitura para o Power BI.
2. Criar o schema do módulo de tanques (`db/migrations/001_tanques.sql`).
3. Credencial Postgres no n8n; trocar, um ramo por vez, os nodes Google Sheets por nodes Postgres (começar por drops de hoje), testando no WhatsApp a cada troca.
4. Migrar dados existentes (são fictícios; recomeçar do zero ou importar CSV).
5. Criar o módulo de concentrado (`002_concentrado.sql`) e os comandos novos (regex primeiro, depois a IA).
6. Views para relatório (ex.: `vw_painel_analises` com Concluído/Pendente/Atrasado).
7. Atualizar docs (arquitetura, comandos, troubleshooting, CHANGELOG → 0.10.0 ou 1.0.0 a decidir), auditoria do workflow e README.
8. Backup: rotina de `pg_dump` no VPS.

## 5. Módulo novo — suco concentrado: recebimento e embarque

### Recebimento

- Suco chega por carreta e enche um tanque principal que depois embarca num navio.
- A unidade é o Load, com Item e Fábrica fixos. Um load recebe lotes aos poucos (cada lote = 1 amostra), de 0 a ~43, podendo levar mais de um dia (ex.: load 44444 item 2020 recebe lotes 01–14 num dia, o resto depois). Não fixar a quantidade de lotes (às vezes 32).
- CT (48h) e BL (72h e 120h): por lote individual, com resultado numérico por lote. Ex.: "quanto deu de CT no load 40400 lote 4" retorna o valor daquele lote.
- Compostas: grupos de lotes analisados juntos para Coliformes e TAB. Normalmente ~5 lotes, mas nem sempre 5 nem em sequência (ex.: "1-3,5,6" ou "1,2,5"; lotes faltantes completam outra composta em outra data). Precisa de relação composta ↔ lotes (tabela de ligação).
- Exemplo de comando: `analise load 40400 item 3030 lotes 1-20` → uma linha por lote.

### Embarque

- Feito por Navio + viagem (ex.: "ORANGE STAR 112"; o campo "Embarque" do laudo é a viagem), Linha e Fase (linha pode ter 2, 3 ou 4 fases).
- Linha = linha física de bombeamento (o "L04", "L07" da arquitetura do navio), independente do número do tanque do navio.
- O número de amostras por linha/fase varia com a tonelada embarcada (não é fixo em 5; às vezes 10). Amostras identificadas A1, A2, A3…
- Uma mesma Linha+Fase pode ter mais de 1 Load associado.
- CT/BL por amostra individual (igual ao recebimento), com resultado numérico.
- Compostas também no embarque; análise da composta é TAB ou Howard, dependendo do navio/destino; Coliformes também existe no embarque.
- Item aparece hoje só na Observação do laudo, mas pode ter coluna própria no banco desde já.
- Exemplo de comando: `analise embarque linha 2 fase 1 A1-A3`.

### TAB, Coliformes e Howard

- **TAB** (total 10 dias): 5 dias no caldo BAT, depois estria em placa por superfície, mais 5 dias em estufa. Consultas planejadas: "quais TABs tenho para espalhar hoje?" (dia 5) e "quais TABs tenho para ler hoje?" (dia 10).
- **Coliformes:** pesa no caldo, 2 dias depois estria na placa, leitura no 3º dia. Comando simples, por exemplo `Coliformes feitos do load 33333 lotes 1-5, item 3333`; no embarque o comando inclui navio, linha e fase.
- **Howard:** resultado em porcentagem, não positivo/negativo: porcentagem de campos positivos sobre os campos lidos. Método padrão: 25 campos em cada uma de 2 lâminas (50 campos), cada campo positivo vale 2%. O banco guarda `campos_lidos` e `campos_positivos` e calcula `howard_percentual`. **Confirmar quantos campos o laboratório lê** (com 100 campos, 1 positivo dá 1%).
- TAB, Coliformes e Howard são feitos no recebimento e no embarque. Os prazos finais serão detalhados "quando for a hora de implementar".

### Itens e tipo de produto

- Item só importa para concentrado, não para NFC.
- Regra prática: concentrado costuma ter Item de 4 dígitos (às vezes 3, ex.: 319); NFC/suco fresco tem 3 dígitos e quase sempre é 129. Não é regra rígida → tabela `itens` aberta para cadastro livre.

### Futuro (depois da migração, NÃO fazer agora)

- Integrar a arquitetura de tanques do navio (documento por navio/viagem): cada tanque do navio (sufixos C/P/S) com tonelagem, Load(s)/Item(ns), destino, fase, Linha e TT (tanque terra que o encheu); tanques de concentrado têm Origem (fábrica) e Linha, NFC não.
- Tanque do navio ↔ Load/Item: muitos-para-muitos (pode haver mistura) → tabela de ligação.
- TT: por ora campo simples (1 TT por tanque do navio); rastrear mistura de vários TT fica para depois.
- Ligações futuras: tanque terra (TT) → tanque do navio → embarque → loads.

## 6. Power BI (V5, depois do banco)

- Fonte: views do Postgres (não as tabelas cruas), acessadas por usuário somente leitura.
- Indicadores desejados: análises pendentes, concluídas e atrasadas; próximas do prazo; próximas do descarte; contagem por tipo de análise; coletas por período (terra × navio); drops previstos; recebimento/embarque (resultados de CT/BL por load/lote e resultados de TAB/Coliformes/Howard).
- Já existe uma prévia simples: aba "Painel" no Sheets (FILTER dos drops do dia) e uma página de simulação do painel feita no Claude.
- A definir: licença (Microsoft 365 Family não inclui Power BI Pro). Power BI Desktop é gratuito para montar/testar localmente; publicar e atualizar de forma agendada normalmente exige Pro e um gateway. Como o VPS não expõe portas, o Desktop conectaria via túnel SSH local. A empresa só tem Microsoft 365 (sem Google), o que favorece Power BI.

## 7. IA avançada sobre o Postgres (V3 parte 2)

- Áudio: transcrever → texto → mesmo parsing (regex, depois IA).
- Foto de laudo: extrair CT, BL 72h, BL 120h etc. para o load/lote correspondente, sempre com confirmação antes de gravar (risco de letra manuscrita).
- Ensinar a IA os comandos novos de recebimento/embarque; manter permissão validada no código.

## 8. Perguntas em aberto (perguntar antes de implementar)

1. Howard: quantos campos o laboratório lê (50 ou 100)?
2. Prazos de TAB, Coliformes e Howard entram nas consultas "o que sai hoje"?
3. Coliformes no embarque: sempre, ou depende do destino como TAB/Howard?
4. Comandos exatos para: criar composta ("composta load 40400 lotes 1-3,5,6"?), registrar resultado de composta, registrar resultado numérico de CT/BL por lote/amostra, e consultas ("quanto deu de CT no load 40400 lote 4").
5. Quem pode registrar resultado (Operador? só Admin?).
6. Nome/número da versão da migração (0.10.0 ou 1.0.0).
7. Começar do zero no Postgres ou importar os dados de teste do Sheets.
8. Licença do Power BI.
9. Onde guardar a cópia do `pg_dump`.

## 9. Lições que valem para a migração

- Mudanças estruturais no n8n introduzem bugs de conexão: sempre exportar e rodar `python scripts/audit-workflow.py LabFlow.json --public` (0 erros).
- Todo ramo precisa terminar em `Respond to Webhook`, senão a Evolution API reenvia a mensagem.
- `Get rows` vazio trava o próximo node (no Postgres, conferir o comportamento equivalente com "Always Output Data").
- "Hoje" sempre em `America/Sao_Paulo`.
- Prompt é código: depois de mudar o prompt, reenviar uma frase de cada intenção (regressão).
- Nunca commitar IDs reais, chaves, telefones reais ou `.env`.
