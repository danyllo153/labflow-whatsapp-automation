# Changelog

Todas as mudanças relevantes deste projeto (LabFlow — automação de registro
de amostras via WhatsApp) são documentadas aqui. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Pra detalhes de *como* cada bug foi encontrado e resolvido, ver
`docs/troubleshooting.md`. Pra entender a arquitetura atual do sistema, ver
`docs/arquitetura.md`. Pra detalhes da infraestrutura de deploy, ver
`docs/deploy-vps.md`. Este arquivo é só o resumo cronológico do que mudou.


## [Não lançado]

### Adicionado
- **Excel só de leitura sobre o banco** (`scripts/gerar-excel-labflow.ps1` + `excel-labflow.config.json`): painel com cartões e uma aba por análise, com gráficos de tendência e a tabela com o registro mais recente primeiro, atualizando com Dados > Atualizar Tudo. A senha do `labflow_leitura` fica só no Windows. Detalhe em `docs/scripts.md`.
- **`excluir_coleta` recusa também coleta com desvio de drop** (migration `034`, pedido da sessão do app na revisão da `033`): o desvio de drop sai junto na exclusão em cascata e não entra no arquivamento; hoje só existe em drop concluído (já recusado), mas a checagem explícita evita depender disso.
- **Corrigir, excluir e recuperar coleta por funções do banco** (PB4, parte 1; migration `033`): `corrigir_coleta`, `excluir_coleta` e `recuperar_coleta`, para o app e, depois, para o bot. **Excluir arquiva** (o registro inteiro, com drops e arquivo, vai para `registros_excluidos`; nada muda nas views nem no bot) e é **recusado** se a coleta tem análise, drop concluído ou TAB; recuperar (Admin, com motivo) volta com os mesmos ids. Corrigir muda tanque, data, navio e quem coletou (a data recalcula os drops pendentes); Operador e Admin em qualquer coleta, Coletor só na própria sem análise. Tudo vai para `historico_alteracoes` (view `vw_historico_alteracoes`). O bot ainda não usa: o comando `corrigir coleta` do WhatsApp continua como estava.
- **Hora de cada leitura (pedido PB1 da sessão do app):** `analises` ganha `pre_leitura_em` e `leitura_final_em`, preenchidas por **gatilho no banco** (vale para o bot, o app e qualquer escrita futura; o workflow não muda). Leituras antigas ficam sem hora. `bi.leituras_nfc` ganha `lida_em` no fim da lista. Migration `030`.
- **Funções do banco para cadastrar pessoa e trocar cargo (pedido PB5 da sessão do app):** `cadastrar_usuario(nome, telefone, cargo, quem)`, `trocar_cargo(usuario_id, cargo, quem)` e `gravar_cargo_bot(...)` (migration `031`). Só Admin; telefone obrigatório (12 ou 13 dígitos); cargos Admin, Operador, Consultor e Coletor; o banco nunca fica sem Admin. O comando `adicionar cargo ...` do bot passa a usar essas funções (um nó novo, `Montar resposta cargo`, mostra a recusa no WhatsApp). Só o `labflow_app` executa. As funções que o app chama são `SECURITY DEFINER` com `search_path` fixo (o app conecta com um papel sem INSERT/UPDATE nas tabelas do bot).
- **Folha de Coliformes pela foto** (17/10): folha cumulativa com a data de cada grupo de linhas; só linhas a partir de 13/10/2026; só o que é novo; "—" grava lido negativo; "+" grava positivo e pergunta se abre a composta lote a lote; E.coli "+" só avisa; linhas de navio acham a composta de embarque. Comando interno `Coliformes da foto` (nodes `BD · Coliformes da foto` e `Montar resposta coliformes da foto`); o "abrir" lote a lote passa a aceitar a composta concluída positiva. Sem migration.
- **Foto do recebimento NFC só com o que é novo** (16/10): lote que ainda não existe registra e grava os resultados da linha no mesmo sim (sem mandar a foto de novo); lote registrado só entra com resultado que falta ou mudou; o que já está igual no sistema não aparece. O comando de recebimento NFC aceita `resultados ct 14 bl72 22` no fim da linha (`BD · Gravar recebimento NFC` grava em `contagens_nfc` o lido e o final). Sem migration.
- **"Todos" de uma vez** (seção 18 do `docs/comandos.md`): `bl72 load 44502 todos deu <10 exceto lote 3 deu 20` grava o resultado em todos os lotes (recebimento), amostras (embarque) ou lotes do NFC que saem hoje, ou na data dita, e ainda não têm resultado; o "exceto" dá outro valor a um lote ou o deixa de fora. Um só sim.
- **Todos os tanques sem crescimento:** `bl todos os tanques navio O.SKY 123 deu <1 exceto tanque 1C normal <1,1,0` grava <1 nas 3 placas de cada leitura que sai na data (terra ou navio, normal e stress); a exceção com placas grava o que deu e o não ok volta com o comando de desvio pronto (não abre desvio sozinho). Nodes `BD · Leituras do todos` e `Montar pergunta placas todos`, pelo mesmo caminho da foto de NFC (`placas_lote`). Sem migration.
- **Leitura antecipada nos tanques:** sem nada vencendo, o comando de placas pega a próxima leitura ainda sem placas e avisa "⏩ Leitura antecipada". No concentrado e no NFC o prazo já não travava.
- `recebimento` antes do load passa a valer nos comandos de C.T/B.L (`bl72 recebimento load ...`). Formatos 37 e 38 no prompt da IA. 29 testes novos em `tests/resultados-todos.test.js` e no catálogo da IA.
- **TAB de tanque de terra "completo" (só Admin):** `Tab feito dos tanques terra 44 coleta 06/10/2026 completo` registra a coleta (com drops e arquivo) e as análises normal e stress que faltarem, marca `<1,<1,<1` nas leituras e como feitos os drops já vencidos até a data do TAB (o que não chegou na data fica sem marcar ou pendente) e registra o TAB, num SQL só e sem duplicar. Se o Admin mandar o TAB de tanque sem coleta, o bot pergunta e o "sim" roda o completo.
- Atalhos de texto `tq 44 16/10` e `tab tanque terra 47 06/10/26` (não passam mais pela IA, que os confundia com "em confirmação").
- Foto de TAB com bloco só de tanques (`TQ 44 16/10`), sem número de load; para o Admin vira o comando `completo`.
- Foto: composta com lote repetido é recusada antes do "sim" (antes gravava o recebimento e falhava nas compostas).
- O recebimento aberto pelo TAB / Coliformes (Admin) já grava **C.T, B.L 72h e B.L 120h = `<10`** nos lotes novos; resultado existente não é sobrescrito. Sufixo `resultados <10` no comando de recebimento (só Admin).
- **Admin abre a composta pelo TAB / Coliformes** (comando e foto): quando a composta não existe, o bot pergunta e, com "sim", registra o recebimento dos lotes que faltam, cria as compostas e registra o teste. Outros cargos seguem barrados. `fabrica` aceita no comando; testes em `tests/tab-abrir-composta.test.js`.

### Corrigido
- **Respostas das fotos de laudo objetivas** (21/10, TAB, recebimento, embarque, NFC e recebimento NFC): só o que vai ser registrado (TAB: o que vai para o caldo, as compostas novas e os tanques com "coleta nova"; recebimento e embarque: load, lotes e compostas), sem a lista de comandos, sem as regras por escrito ("só o Admin abre", "valor riscado não foi lido", "não abro desvio sozinho", legenda de siglas) e sem citar o que já está no sistema; se não há nada novo, responde "nada novo para registrar" (o analista digita, manda a foto de novo ou um áudio). O que grava depois do sim não mudou.
- **Backup diario do banco voltou a funcionar** (21/10): desde a migration 050 do app (schema `app`) o `backup-db.sh` falhava com `permission denied for schema app` e deixava arquivo vazio (cron de 20 e 21/10). Agora o dump e feito pelo administrador do banco, confere a lista de tabelas e apaga o arquivo se falhar. Ultimo backup bom do cron antes disso: 19/10.
- **Coliformes pela foto, resultado em branco** (19/10): folha sem nada nas colunas de resultado vira "vai para o caldo" (antes o prompt ensinava `-` e o bot lia negativo); o grupo do papel que junta compostas (`1-6` = `(1-3)` + `(4-6)`) grava em cada uma, e item diferente do sistema usa a composta que já existe e avisa, em vez de abrir outra. A resposta ficou objetiva: o que vai para o caldo, o que recebe resultado (negativo/positivo) e o que o Admin abre antes; não fala mais de linhas antigas nem do que já está gravado.
- **Resposta repetida da foto (16/10):** a foto do laudo leva mais de 1 minuto na IA e a Evolution reentregava a mesma mensagem a cada ~65 s; cada reentrega rodava o fluxo e o bot respondia 3 vezes. Agora o id da mensagem é gravado (migration `032_mensagens_recebidas`, só o id e a hora) e a reentrega é descartada no `Interpretar comando`. Os reenvios internos do bot não têm id e seguem normais.
- **NFC recebido: o chat mostra o número do laudo** (decisão de 16/10): a foto, a confirmação do comando, o "era ..." da correção e as consultas mostram o valor lido (`CT 4368`), sem a conta da diluição. O banco continua gravando também o valor multiplicado (`contagens_nfc.valor`), que é o que o Power BI mostra.
- IA: "bl" sozinho vale bl120 também nas placas de tanque (a regressão de 16/10 achou bl72; 59 de 60 antes da correção).

### App (web e celular, em `app/`)
- API em **FastAPI** com testes automáticos no GitHub Actions sobre um PostgreSQL de teste (todas as migrations e os dados fictícios de `db/seeds`); `/saude` e documentação em `/docs` (APP-001, APP-002).
- Migration **050** do app: schema `app` (credenciais, senhas provisórias, sessões) e papel `labflow_app_web`, que lê as tabelas do bot e grava só no schema `app` (APP-003). Aplicada no servidor de demonstração em 19/10/2026.
- Login com usuário curto e senha (argon2), sessão em cookie seguro por até 30 dias sem uso, bloqueio de 15 min após 5 senhas erradas, sair e "quem sou eu" com o cargo lido a cada chamada (APP-004).
- Permissões por cargo (Admin, Operador, Consultor, Coletor) num lugar só (APP-005).
- Senha provisória gerada pelo Admin (24 h, uso único), troca obrigatória no primeiro login, mínimo de 8 caracteres, senha igual ao usuário recusada (APP-006).
- Admin → Pessoas: lista com situação (sem telefone) e usuário curto (APP-007).
- Páginas **Coletas** e **Recebimento** só leitura, pelas views do Power BI, com filtros e paginação (APP-008).
- Exportar para **Excel** as páginas Coletas e Recebimento, com os filtros aplicados (APP-009).
- **Pendências de hoje** (vence hoje e atrasados) por bloco, lendo as views do Power BI (APP-010).
- **Container** da API (`app/api/Dockerfile`) e stack separada com acesso só pelo **Tailscale** (`app/api/deploy/`), sem porta pública; comando `primeiro_admin` para o primeiro login do Admin; a migration 050 passa a dar o `CONNECT` no banco ao `labflow_app_web` (o banco do servidor não deixa o `PUBLIC` conectar); CI no Postgres 15, igual ao servidor, e conferindo que a imagem sobe (APP-011).
- **API no ar** no servidor de demonstração em 19/10/2026, só pelo Tailscale, com o primeiro Admin logado (APP-011).
- **Telas do app (Fase C)** em React + TypeScript (`app/web/`), entregues pela própria API em `/app/`: menu lateral no computador e barra embaixo no celular, paleta aprovada, faixa "Dados de demonstração", app **instalável** que guarda só os arquivos das telas (nenhum dado no aparelho); imagem em dois estágios e CI testando e montando as telas (APP-012).
- **Entrar, criar a senha e sair** pelas telas do app: botão Entrar travado enquanto espera (dois cliques mandam um login só), mensagens de senha errada, login bloqueado e sem internet em português, troca obrigatória depois da senha provisória (confere tamanho, senha igual ao usuário e repetição antes de mandar), troca voluntária pedindo a senha atual, Sair no menu e volta automática para a tela de entrar quando a sessão acaba (APP-013).
- **Início com as pendências de hoje:** cartões **Para hoje**, **Atrasados** e **Desvios abertos** (tocar filtra a lista), pendências por bloco do relatório do dia com a situação em texto e a data, bloco grande recolhido em 8 com "Mostrar todos", atualização sozinha a cada minuto. A API passa a dar o total de desvios abertos e a referência de TAB e Coliformes com a composta e o lote ("Load 90009 · Composta #18, lote 8"), que antes saía repetida (APP-014).
- **Páginas Coletas e Recebimento na tela:** lista das páginas do laboratório, filtros guardados no endereço (recarregar ou mandar o link mantém o filtro) com etiquetas removíveis, tabela no computador e um cartão por linha no celular, situação em etiqueta de texto, paginação, **Exportar Excel** do filtrado e **Imprimir só o filtrado** (todas as linhas, não só a página da tela; A4 em pé ou deitado; título, filtros, data e "Página X de Y"); atualiza a cada minuto (APP-015).
- **Admin → Pessoas completo:** **Nova pessoa** (nome, telefone, cargo e usuário curto, sugerido pelo nome; cadastra pela mesma função do bot, então a pessoa já é reconhecida no WhatsApp, e gera a senha provisória, tudo ou nada), **trocar cargo** (função do bot; não deixa o sistema sem Admin), **desbloquear** quem errou a senha 5 vezes, **bloquear e liberar o acesso** ao app (o Admin não bloqueia a si mesmo) e gerar senha provisória, sempre com confirmação dizendo o que vai acontecer. No celular, por **Minha conta**. Migration **051** (o app pode chamar `cadastrar_usuario` e `trocar_cargo`), com desfazer; o CI desfaz e reaplica todas as migrations do app (APP-016).
- **API das páginas Tanques, Drops e Desvios** (leitura pelas views do Power BI `bi.leituras_nfc`, `bi.drops` e `bi.desvios`): filtros (período, origem, tanque, navio, análise, frasco, etapa, resultado, drop, abertos/concluídos, situação, quem), paginação e Excel com os mesmos filtros; desvios abertos primeiro; o Coletor não vê (APP-017).
- **API das páginas Embarque, TAB e Coliformes (com Howard), Recebimento NFC, Navios e Visão geral:** leitura pelas views do Power BI, filtros, paginação e Excel; **Navios** (nova) soma por navio e viagem as coletas, tanques, leituras lidas e pendentes, Não ok e desvios; **Visão geral** dá os números do período (padrão 30 dias), as pendências por bloco (iguais às do Início) e os 20 Não ok mais recentes; Recebimento NFC sem Ok/Não ok (o NFC recebido não usa os limites do concentrado); o Coletor não vê (APP-018).
- **Todas as páginas do Power BI no app:** Tanques, Drops, Desvios, Embarque, TAB e Coliformes, Recebimento NFC e Navios na mesma tela de Coletas (filtros, Excel, imprimir, cartões no celular), resultado Positivo/Confirmado como alerta e Negativo como ok; **Visão geral** com o período (padrão 30 dias), os números do período (em vermelho quando há Não ok), as pendências por bloco e os Não ok mais recentes com link para a página; datas estranhas não derrubam a tela (APP-019).
- **Gráfico G2 no Recebimento:** C.T 48h, B.L 72h e B.L 120h ao longo do tempo, um painel por análise com a **linha do limite**; Não ok em vermelho **e** quadrado, "menor que" vazado, detalhe ao passar o dedo; tocar num ponto filtra a tabela pelo load; responde aos filtros da página. A API dá os pontos e os limites, e um teste confere que os limites batem com o Não ok da view do bot (APP-020).
- **Tanques terra e Navios separados, cada um com status e a sua página:** Páginas agrupadas em Geral, NFC e FCOJ (concentrado); "Recebimento FCOJ" e "Embarque FCOJ" separados. **Tanques terra** tem uma linha por tanque e coleta e abre a página do tanque (leituras com o método, drops, desvios, TAB, Coliformes e Howard). **Navios** lista todos os navios (NFC e FCOJ) e abre a página do navio: os tanques NFC e o concentrado por linha e fase, que leva ao Embarque FCOJ já filtrado. Status: **Concluído** quando nada está pendente (leituras, drops, desvios, C.T/B.L do embarque, TAB, Coliformes e Howard), **Atrasado** quando algo venceu, senão **Em andamento**. Os alertas da Visão geral levam direto ao tanque, ao navio ou ao load (APP-019b).
- **Migration 052 do app (o turno):** `app.turnos` (Manhã 08–16, Tarde 16–00, Madrugada 00–08), `app.entradas_turno` (quem entrou, com entrada e saída editáveis; um turno aberto por pessoa), `app.relatorios_turno` (textos à mão, encerramento e reabertura com motivo), `app.atividades_fixas` (a lista de 16/10, com "só às sextas") e `app.atividades_feitas` (Feito / Não feito de atividade fixa ou pendência escrita), com desfazer. Não altera tabela do bot (APP-021).
- **Entrar e sair do turno:** tela **Turno** (na barra de baixo): escolher Manhã, Tarde ou Madrugada (o app sugere pelo horário), ajustar a própria entrada, **Sair do turno** com confirmação e a hora (dá para mudar) e corrigir o horário dos últimos turnos; uma entrada aberta por pessoa; a Madrugada conta no dia em que começa; quem esqueceu de sair sai sozinho no fim do turno; Consultor não entra. No Início, o cartão **Feito no turno** (coletas, leituras de NFC, drops concluídos e atividades do turno no horário do turno) e o aviso para entrar no turno (APP-022).
- **Correção:** entrar num turno escolhe sempre o turno em andamento ou o próximo, nunca um que já terminou (às 02:00, a Tarde com entrada 15:00 caía na Tarde da véspera e a entrada fechava na hora, sem o app avisar) (APP-022).
- **"Analista" no lugar de "Operador" nas telas:** menu, Minha conta e Admin → Pessoas mostram "Analista"; a API aceita "Analista" ao cadastrar e trocar cargo e grava "Operador" até a sessão do bot trocar o nome no banco e no WhatsApp (pedido PB7).
- **Atividades fixas do turno no Início:** "Para fazer agora" com a lista do turno (a da entrada da pessoa), cada atividade com **Feito** e **Não feito** (grava quem e quando; tocar de novo desmarca); a que só vale numa sexta aparece só nas sextas; o **Não feito** vira **pendência herdada** no turno seguinte, com a caixa de Feito, até alguém fazer ou passarem 3 dias; o cartão Feito no turno conta as atividades (APP-023).
- **Relatório do turno:** página por turno e dia, a mesma para todos (link na tela Turno): **analistas** com entrada e saída; **análises feitas** (coletas, leituras de NFC, drops concluídos e atividades do turno, por pessoa, pela hora em que foram gravadas); **Adiantado** em linha separada (registrado antes da data prevista; não conta como feito); **pendentes** neste momento por bloco; atividades do turno sem Feito; o que só tem data (C.T/B.L, TAB, Coliformes, Howard) em uma linha do dia; campos **escritos à mão** (pendências, esterilizações pendentes, ocorrências, outros analistas); turno anterior e próximo; **imprimir** (APP-024).
- **Encerrar o turno:** a última pessoa toca em **Encerrar turno** no relatório e vê o que passa adiante ("Ficam para a Tarde: ..."); o relatório vira só leitura e a saída dela é registrada; se ainda há gente no turno, o app diz quem (o Admin pode fazer sair os outros). Sem encerrar, o turno **se encerra sozinho** quando o próximo começa (e quem esqueceu de sair sai no fim do turno). O **Admin reabre com motivo** (fica guardado) e o turno reaberto não se fecha sozinho de novo. As **pendências escritas à mão** viram **recados** com a caixa de Feito no Início do turno seguinte (APP-025).
- **Entrar no turno só na hora:** dá para entrar no turno em andamento ou no próximo, se ele começa em até 2 horas (quem chega mais cedo); antes disso o app avisa ("A Tarde começa às 16:00. Entre quando chegar ou escolha a Madrugada.") (APP-022).
- **Check-in no turno:** Operador e Coletor só usam o resto do app (Início, páginas e, depois, o relatório do turno) depois de marcar a entrada; antes disso, qualquer tela mostra o Turno, e a API recusa ("Entre no turno antes de continuar."). Entrada e saída valem a **hora do toque**; corrigir o próprio horário pede **motivo**, e o horário marcado no app fica guardado (migration **053**). Admin e Consultor ficam livres (APP-022b).

## [1.3.0] - 2026-10-15

Primeira versão em **piloto de 1 mês no laboratório** (desde 13/10/2026: 5 operadores e 1 admin, dados reais autorizados pelo gestor). Em destaque: **comando por áudio**, **IA resiliente** (Gemini → Groq, com limite diário), **leitura de laudo por foto** (recebimento, TAB, Coliformes, NFC, embarque e Recebimento NFC), **Recebimento de NFC** com diluição e página própria no Power BI, **`coletado por`** e o cargo **Coletor**, fábricas travadas e consultas de resultado. Banco até a migration `029`; workflow de 244 nós; 474 testes.

### Adicionado
- **Comando por áudio** (Fase 5 adiantada): o Gemini transcreve o áudio do WhatsApp (até 1 minuto), o bot responde "🎤 Ouvi" e o texto vai direto para a IA, que sempre pede "sim" antes de gravar; "sim"/"não" falados confirmam. Seção 16 do `docs/comandos.md`; testes em `tests/voz.test.js`.
- Regressão do prompt da IA com frases de placas e de repetição (`scripts/gerar-teste-prompt-ia.js`, 52 frases).
- Painel: a página **Desvios** junta os desvios de drop e de tanque (migration `019`), com filtro por tipo e por análise, e a tabela com placas, prazo e resultado.
- **IA resiliente** (piloto de 13/10: o Gemini respondeu `503` em ~1 de cada 7 chamadas, com chamadas penduradas por mais de 5 minutos): texto livre e áudio agora usam chamadas HTTP com **tempo máximo de 20 a 30 s** e **reserva automática** (Gemini → Groq → Gemini 3.8 Flash no texto; Gemini → Whisper do Groq no áudio), com resposta padronizada para o resto do fluxo. Ver `docs/arquitetura.md`.
- **Limite diário de IA** por pessoa (100) e no total (500), com a migration `020_uso_ia.sql`: passou do limite, o bot avisa e não chama nenhum provedor.
- **Pré-tratamento da fala e do ditado** sem IA (`menor que 10` → `<10`, `lotes 11 a 16` → `11-16`, números por extenso, `Lod 43 699`, `ente 2655`, ordem item/fábrica, ditado de C.T/B.L) e **atalho de áudio**: fala que já é um comando completo de C.T/B.L, recebimento ou compostas não chama a IA (continua pedindo "sim"). 31 testes novos.
- **Fábricas travadas** (decisão de 14/10): só AQA, CON, COL, UCH, ITA e TMG. O nome da cidade (por extenso ou falado) vira a sigla, letra torta (AOQ, AKA) vira a sigla parecida só quando é única, e o bot avisa o que corrigiu; qualquer outra é recusada, sem cadastrar fábrica nova. Antes, qualquer sigla digitada criava uma fábrica.
- **Navios e tanques por extenso:** Orange Sky vira O.SKY; 1 center vira 1C, 2 port vira 2P, 3 starboard vira 3S, 2PS vira os dois lados (2P, 2S). O prompt da IA ganhou a lista das seis fábricas e esses nomes. 10 testes novos.
- **Leitura de foto de laudo (fase 1):** a foto do laudo de recebimento, TAB ou Coliformes vira uma lista de comandos oficiais com **um só sim**. Gemini com visão (3 Flash Preview, reserva 3.5 Flash-Lite, 3 tentativas cada) devolve só dados, o código valida (fábricas travadas, load/item, lotes, marcas de composta, ano da coleta dos tanques) e acha as compostas existentes para mostrar o #N. O `sim` agora executa **uma lista** (`Expandir comandos` + reenvio um por vez). Conta no limite diário (tipo `foto`). Seção 16.5 do `docs/comandos.md`; 23 testes em `tests/foto-laudo.test.js` (respostas simuladas, nenhuma foto no repositório).
- **Foto do laudo de NFC (resultados das placas):** a foto do laudo com as 3 placas de C.T, B.L e WORT de cada tanque (normal e stress) vira uma confirmação compacta com ok / não ok e **um só sim** que grava todas as leituras de uma vez (`BD · Executar placas da foto`). Número colado só vale com exatamente 3 valores; o que não separa fica de fora. **Não abre desvio sozinho**: lista os não ok com o comando de placa pronto. Sem migration (pendência `PLACAS` com `acao: placas_lote`). 17 testes em `tests/foto-nfc.test.js`.
- **Resultados de C.T/B.L do recebimento NFC:** `ct nfc load 44300 lote 10 past deu 14` (e `bl72`, `bl120`), com confirmação por sim; o número lido é **multiplicado pela diluição** do lote (14 com 10^1 = 140), **sem alarme** (o NFC recebido não usa os limites do concentrado e fica fora do relatório do dia), resultado repetido corrige e corrigir a diluição recalcula. Entra nas consultas `quais ct tenho para ler hoje?` e `quanto está o CT do load ...` e na leitura por foto (valor riscado não vale). Migration `027` ganhou `contagens_nfc`, `vw_contagens_nfc`, `vw_contagens_nfc_previstas` e `bi.recebimento_nfc` (base da página do Power BI). `tests/recebimento-nfc-resultados.test.js`.
- **Página Recebimento NFC, ajustes (15/10):** resultado final sem `Mi` no gráfico, os gráficos viraram **2 de tendência** (fresh e pasteurizado, cada um com C.T 48h e B.L 120h) e **1 de colunas com os NFCs analisados por fábrica**, filtro Tipo em lista e botão do menu `Receb. NFC` (antes dois botões ficavam `Recebime...`).
- **Recebimento NFC: uma mensagem só (15/10):** a foto grava todas as linhas de uma vez (comando com linhas separadas por `;`) e responde numa mensagem só, em vez de uma por linha.
- **Foto do NFC: 10 colado no expoente (15/10):** `101`, `102`, `103` e `104` na diluição valem 10^1 a 10^4 (antes eram lidos como o número 101, 103...).
- **Arrumação (15/10):** números do README atualizados (244 nós, 49 tipos de comando, 23 migrations, 26 tabelas, 17 views, 11 páginas no painel, 474 testes); branches locais já mescladas apagadas; backlog e roadmap do Obsidian revisados.
- **Cargo Coletor (15/10):** só registra a própria coleta e corrige/apaga a própria coleta quando erra o tanque (`corrigir coleta tanque terra 42 para 43`, `apagar coleta ...`); o resto é barrado no bot e na IA. Migration `029`.
- **Coleta com `coletado por <nome>` (15/10):** o registro de coleta (terra e navio) aceita o nome de quem coletou, quando não foi quem mandou a mensagem; as consultas e o painel mostram esse nome (migration `028`). Sem o nome, vale quem mandou, como antes.
- **Diluição falada (15/10):** o recebimento NFC aceita `10 elevado à terceira`, `10 diluído à terceira`, `10 à primeira`, `10 a 3`, `10^3`, `10 ao cubo` e números por extenso; a IA de texto escreve sempre `10 elevado a N`.
- **Túnel do Power BI automático (15/10):** `scripts/tunel-powerbi.ps1` mantém o `localhost:15432` de pé e reconecta sozinho; tarefa agendada do Windows inicia com o login (ver `docs/scripts.md`).
- **Página `Recebimento NFC` no Power BI (15/10):** tabela `bi recebimento_nfc` (view `bi.recebimento_nfc`, migration 027) e página com lotes por mês e tipo, resultado final médio por análise e tipo, lotes por fábrica e a tabela com **diluição, valor lido na placa e resultado final já multiplicado**. Gerada por `node scripts/gerar-painel-powerbi.js`; o painel só atualiza depois de aplicar a migration 027 e conferir no Power BI Desktop.
- **NFC identificado pelo item 129 (15/10):** o laudo de recebimento do NFC tem o título só `Recebimento`; a foto e o comando decidem pelo item 129 (concentrado com 129 é recusado, laudo misto lê só o NFC). Regras novas: `past` só na AQA e sempre 10^1; `fresh` de 10^2 a 10^4; cada linha da foto tem a própria data; o recebimento NFC é **um lote por comando** e a foto gera um comando por linha.
- **Recebimento de NFC (item 129):** comando `recebimento nfc load 44300 fab aqa item 129 lote 10 past 10 elevado a 1` (o início é opcional), com o tipo `fresh`/`past` e a diluição por lote; o mesmo lote vale nos dois tipos e repetir corrige. Migration `027` (`recebimento_nfc` + `vw_recebimento_nfc`), ajuda `comandos recebimento nfc`, formato 33 do prompt da IA e leitura do laudo por foto. Seção 17 do `docs/comandos.md`; `tests/recebimento-nfc.test.js`.
- **Foto de TAB e Coliformes numa mensagem só:** em vez de um comando (e uma resposta) por composta, a foto manda um único `Tab feito das compostas #18 a #34` (ou `Coliformes feitos ...`), com faixas, e a confirmação lista as compostas por load. A data do papel vale se for de hoje ou dos últimos 3 dias.
- **Resultados do embarque por foto:** a foto do laudo de embarque lê C.T, B.L 72h e B.L 120h por amostra (valor riscado não vale), mostra uma linha por amostra com 🚨 e correções, e grava tudo com um sim (`BD · Gravar contagens da foto`, pendência `TAB` com `acao: contagem_lote`). Embarque ainda não registrado: registra primeiro e pede a foto de novo. 12 testes em `tests/foto-embarque-resultados.test.js`.
- **Resultado do tanque:** a leitura prévia sem lançamento (B.L 72h, WORT 120h) conta como ok quando a leitura final da mesma análise (B.L 120h, WORT 240h) já saiu ok; se a final deu não ok ou ainda não saiu, a prévia continua aguardando.
- **Foto do laudo de embarque (FCOJ):** cada linha do papel (linha/fase, load, item da Observação, amostras A1..A3) vira `Embarque navio ... linha .. fase .. load .. item .. amostras ..`, com navio e viagem juntos (`O.Star` + `112` = `O.STAR 112`) e a data da primeira linha valendo para as seguintes. Não cria composta. Os resultados de C.T/B.L ainda não são lidos. `tests/foto-embarque.test.js`.
- **Placas coladas na foto de NFC:** como nenhuma placa passa de 99, 6 dígitos sem separador viram 2+2+2 (`121415` = 12, 14, 15), além dos 3 dígitos que viram 1+1+1.
- **Foto de recebimento (teste ao vivo de 14/10):** a confirmação ganhou o bloco "O que isso cria" com os lotes de cada load e cada composta em linguagem simples (`1ª composta = lote 27`), porque só o comando `(27)(28)(34)…` não deixava claro o que seria criado.
- **Foto de NFC (teste ao vivo de 14/10):** célula de 3 dígitos devolvida pela IA como lista de 1 item (`392`) agora vale (3,9,2); cada célula que fica de fora mostra o comando pronto para corrigir, com `V1,V2,V3` no lugar das 3 placas.
- **Consultas de quem coletou e de resultados** (pedido de 14/10): `quem coletou o tanque 41 do dia 14/10/2026`, `quem coletou os tanques do navio O.SKY 123` (agrupado por pessoa), `quanto está o CT do load 44444 até agora` (lotes lidos, lotes que faltam e alarme; também BL e embarque), `resultado do tanque 41` (placas e ok/não ok) e `desvios do tanque 41 do dia 14/10/2026` (filtro de data). Sem tabela nova; ajuda `comandos consultas`. Seção 16.4 do `docs/comandos.md`; testes em `tests/consultas-resultados.test.js`.
- **Fala com vírgulas e milhar** (áudios reais de 14/10): a transcrição às vezes põe vírgula depois de cada palavra (Recebimento, load, 46,699, fábrica AQA, item, 2655, lotes, 35 a 38.) e escreve o load com separador de milhar. O tratamento da fala agora entende isso, separa grupos de C.T sem vírgula (deu 0 lote 10) e aceita CT, load ...; assim o atalho de áudio (sem IA) funciona nesses casos. 4 testes com as transcrições reais.
- `scripts/sanitize-workflow.ps1` distingue credenciais do mesmo tipo pelo nome (`Groq API` → `GROQ_CREDENTIAL_ID`).
- **Ajuda completa:** o menu comandos agora lista **NFC, Concentrado e Geral** e cada assunto abre (comandos recebimento, comandos tab, comandos coliformes, comandos embarque, comandos howard, comandos ct bl, comandos placas...). Antes só tinha os temas de tanques, escritos como "consultar". 36 testes executam cada comando de exemplo da ajuda.
- scripts/sanitize-workflow.ps1 remove settings.errorWorkflow (ligação do alerta de erro, própria da instância) do arquivo público.

### Alterado
- **Placas de NFC com mais de uma coleta aberta:** quando o mesmo tanque (e frasco e análise) tem mais de uma coleta ainda sem placas e o comando não traz `coleta dd/mm/aaaa`, o bot **pergunta de qual coleta é** (lista cada uma com a data prevista) e não grava nada, em vez de escolher uma sozinho. Com a data, ou com uma só aberta, nada muda. Consulta `BD · Buscar leitura NFC` e node `Montar pergunta placas`; 3 testes novos.
- Painel: navegação com 10 páginas sem cortar o nome e faixa de cartões mais alta (sem barra de rolagem).

## [1.2.0] - 2026-10-09

### Adicionado
- **Resultados de NFC placa a placa** (`docs/specs/nfc-resultados-placas.md` v1.0, tarefas NFC-002 a NFC-008): comandos de placas em triplicata (`ct do tanque 47 normal 12,8,15`, `bl72`, `bl120`, `wort profundidade|superficie 120h|240h`), com ok / não ok pelo limite e "sim" antes de gravar; gravar as placas marca a leitura como feita. Leitura não ok em C.T, B.L ou WORT: o bot pergunta se abre o **desvio de tanque**, que cria a **repetição** (frasco de arquivo, triplicata, mesmos prazos) e fecha sozinho com a nova contagem. `repetição do tanque 47 stress bl120` registra a repetição feita ("reanálise" é o mesmo comando e nunca vira análise nova). Seção 15.3 do `docs/comandos.md`.
- `leitura do dia finalizada` preenche **<1** nas placas de NFC que ninguém digitou.
- Relatório do dia: tanque com leitura não ok aparece com 🚨 e a contagem (`47 🚨 (30, 12, 8)`), alerta por leitura, linha **Desvios de tanque**; no `completo`, `— ok` / `— não ok` também nas linhas de NFC, drops e Howard (limite com vigência na tabela `limites_howard`).
- Consulta de desvios (`quais desvios estão abertos?`, `quais desvios do tanque 47?`) mostra desvios de drop e de tanque.
- IA: catálogo com os comandos de placas e de repetição (texto e frases de áudio), e testes do catálogo.
- Migration `017` (situação no relatório, fechamento automático do desvio de tanque, `limites_howard`) e `018` (placas, resultado e desvio em `bi.leituras_nfc`).
- Painel: a página Tanques virou **Análise TT** (tanques de terra) e **Análise T.N** (tanques de navio): resultado das placas, tendência do C.T por coleta e desvios de tanque (10 páginas).
- Dados de demonstração das placas e de desvios de tanque (`db/seeds/demo_placas.sql`).
- Testes do NFC placa a placa (`tests/nfc-placas.test.js`): 229 testes no total.
- **Painel do Power BI** (`powerbi/labflow.pbip`, formato PBIP versionado): 8 páginas (Visão geral, Coletas, Tanques, Drops, Recebimento, Embarque, TAB e Coliformes), modo escuro, cabeçalho e cartões em HTML (visual HTML Content Secure), filtros por navio/terra, tanque, load, fábrica, item e período. Lê as views `bi.*` (migration 013) pelo usuário somente leitura, por túnel SSH. Gerado por `scripts/gerar-painel-powerbi.js` (com o modo `--so-relatorio`); tabelas de apoio (Loads, Embarques, Calendário) e ligações criadas pelo Power BI Modeling MCP. Números conferidos contra o banco. Backup da versão colorida em `scripts/gerar-painel-powerbi-colorido.js`.
- Migration `014`: a view `bi.testes` ganha as datas de cada etapa (`espalhar_prevista`, `leitura_prevista` e `confirmacao_prevista`), e as páginas TAB e Coliformes mostram **Leitura prevista** e **Confirmação** separadas (o TAB incubado é lido todo dia e pode ir para confirmação antes da leitura prevista).
- Migration `015`: na view `bi.testes`, cada lote da composta de Coliformes aberta aparece com o seu número e o código do bot (`#12.3`), a composta que deu positivo e foi aberta aparece como "Positivo, em confirmação" e a sua próxima data vem dos próprios lotes. A tabela de Coliformes mostra a composta seguida dos lotes, cada um com etapa e resultado próprios (a composta é positiva se algum lote der positivo).
- Painel: Calendário do início do mês de 2 meses atrás até hoje + 15 dias (drop D15); tabelas com uma linha por registro.
- Painel: página **Desvios** (9ª página), com os desvios de drop: em qual temperatura confirmou (7, 13 e 25 °C), por quem abriu e por resultado, filtros por navio/terra, tanque, drop e data da coleta. Fica pronta para receber depois os desvios de tanque e as amostras repetidas. A página Drops fica mais limpa (cartões de drops concluídos e com desvio; gráfico por navio/terra). Demo com 12 desvios.
- **Painel em modo claro**: fundo azul-gelo, cartões e gráficos brancos com borda suave, texto marinho e as mesmas cores de significado; cabeçalho e cartões sem barra de rolagem. O modo escuro continua no gerador com `--escuro`.
- README: próximos passos com a plataforma própria (login, tela do dia, pendências do turno, assistente de IA), RAG das instruções de trabalho e laudos automáticos; o WhatsApp continua como canal opcional.
- Migration `016` (resultados de NFC placa a placa, `docs/specs/nfc-resultados-placas.md` v1.0): tabelas `leituras_placas` (triplicata, "<1" automático), `limites_nfc` (com vigência; os limites reais ficam fora do Git, o repositório traz só `db/seeds/limites_nfc_exemplo.sql` com valores fictícios) e `desvios_tanque` (C.T, B.L e WORT, com a repetição pelo frasco de arquivo em `analises.repeticao_de`), e as views `vw_situacao_nfc` (ok / não ok / pendente com a contagem) e `vw_desvios_tanque`. Ainda sem uso pelo bot (próximas tarefas NFC-002 a NFC-008).
- Dados de demonstração para o painel (`db/seeds/demo.sql` e `limpar_demo.sql`): 3 fábricas, 2 itens, 9 loads de recebimento, 3 embarques em 2 navios e testes em todas as etapas.
- **IA cobre todos os comandos novos** (concentrado, TAB, Coliformes, Howard, C.T/B.L, relatório, leitura do dia finalizada e desvio de drop): o Gemini reescreve a frase livre num formato oficial de um catálogo (intenção `comando`) e o código confere o formato, decide se pede "sim" e reenvia para a regex, que valida de novo. Dado faltando vira pergunta (`incompleto`). Pensado também para o áudio (números por extenso). Testado com 44 frases no Gemini real (44 de 44) e 107 testes automáticos do node `Validar resposta da IA` (`tests/validar-ia.test.js`, catálogo em `tests/catalogo-ia.js`).
- `scripts/gerar-teste-prompt-ia.js`: gera o workflow de regressão do prompt (placar no n8n).
- **`leitura do dia finalizada`**: quem lê o dia fecha tudo o que sai hoje de uma vez (leituras de NFC e drops como lidos; TAB e Coliformes sem crescimento como Negativo), com "sim" antes. O que está em confirmação não muda e C.T/B.L do concentrado ficam pendentes até digitar o valor. O relatório do dia termina com "finalizada por X às HH:MM". Migration `011`. Ver `docs/comandos.md` 15.1.
- **Desvio de drop**: `drop d5 do tanque 45 data 30/09/2026 não ok` abre desvio (com "sim"): repetição do drop de arquivo em 7, 13 e 25 °C por até 5 dias; resultado por temperatura (`confirmou em 13 e 25 graus` ou `não confirmou`); consultas `quais desvios de drops do tanque 45?` e `quais desvios estão abertos?`. No relatório, drop não ok = 🚨 e linha "Desvios". Migration `012`. Ver `docs/comandos.md` 15.2.
- Testes automatizados do node `Interpretar comando` (`tests/`, 80 casos): reconhecimento dos comandos, campos extraídos, prazos de negócio, recusas e permissões. Rodam com `npm test` e na GitHub Action `testes.yml`. Ver `docs/scripts.md`.

### Corrigido
- Resposta do "sim" só depois de gravar (Bug 29): as gravações rodam em fila e só então o bot responde; se o banco recusar, não sai "✅ Feito".
- "Reanálise" virava registro de análise nova, pela regex e pela IA (PR #32).

### Alterado
- A auditoria só cobra "Respond to Webhook" de workflow que tem Webhook.
- `bl` sozinho (e `bls`) passa a valer `bl120`, no registro e nas consultas de C.T/B.L. `bl72` continua valendo 72. Antes, `quais bl tenho para ler hoje?` ia para a IA.
- `CLAUDE.md` com as regras de trabalho do projeto.
- **Alerta de erro no WhatsApp:** segundo workflow (`LabFlow_Alerta_Erro.json`), ligado ao bot em *Settings → Error workflow*, que avisa todos os Admin quando um ramo falha. Não leva o texto das mensagens dos usuários, mascara números longos e não repete o mesmo erro em 10 minutos. Validado de ponta a ponta em 05/10/2026 (falha proposital → um alerta só). Ver `docs/arquitetura.md`.
- 9 testes do alerta de erro (`tests/alerta-erro.test.js`); a Action de auditoria também audita o `LabFlow_Alerta_Erro.json`.

## [1.1.0] - 2026-10-04

### Added
- **Módulo de suco concentrado (FCOJ)**, tudo pelo WhatsApp e sobre o PostgreSQL. Desenho em
  `docs/concentrado.md`, comandos em `docs/comandos.md` (seções 12.1 a 15):
  - **Recebimento** de lotes por load, item e fábrica, e **compostas** (de 1 a N lotes, em
    qualquer combinação) com número curto `#N`
  - **TAB de composta**: caldo → espalhar (+5 dias) → incubar → confirmação (PCA 24h) → resultado,
    com consultas ("quais tabs tenho para espalhar/ler hoje?"), comandos em lote e atrasados com a
    data prevista
  - **TAB de NFC (tank farm)**, por tanque, sempre citando a data da coleta
  - **Coliformes de composta**: caldo → estria (+1 dia) → leitura (+1 dia); a confirmação abre a
    composta lote a lote (no embarque, amostra a amostra)
  - **Embarque** por navio + viagem, linha e fase, com amostras A1, A2... de um load por comando;
    load antigo que nunca passou pelo recebimento é cadastrado na hora (a fábrica é opcional)
  - **Howard** (embarque): porcentagem em 50 campos, sempre par, com confirmação
  - **C.T 48h e B.L 72h/120h por lote e por amostra**, com vários grupos por mensagem
    (`ct load 77001 lote 4 deu 10, lotes 5-10 deu <10`) e valores `=`, `<` e `>`
  - **Alarme**: B.L a partir de 50 e C.T a partir de 200; TAB e Coliformes positivos também
- **Relatório do dia com os quatro blocos** (FCOJ recebimento, FCOJ embarque, NFC tank farm e NFC
  navio) numa mensagem só, com ✅ no lido e 🚨 no que passou do limite. `relatório do dia completo`
  traz só o que já foi lido, com a Situação (`ok` / `não ok`) nas linhas do concentrado. Filtros por
  bloco (`recebimento`, `embarque`, `tanques terra`...)
- Migrations `003` a `010` (`db/migrations/`): relatório de NFC, view das compostas, confirmação do
  TAB, testes por lote e por amostra, busca de composta, embarque, contagens e testes de embarque
- `scripts/sanitize-workflow.ps1`: gera o `LabFlow.json` público a partir do export com IDs reais
- Comandos de embarque, Howard, TAB de NFC e C.T/B.L documentados em `docs/comandos.md`; desenho
  completo do módulo em `docs/concentrado.md`

### Changed
- O workflow passou de 97 para 159 nodes (41 nodes Postgres, todos parametrizados), dentro do mesmo
  bloco "Concentrado" do canvas
- `relatório do dia` deixou de ser só NFC: sozinho, traz os quatro blocos. A linha TAB do tank farm,
  que mostrava `-`, passa a listar os TABs de NFC
- TAB e Coliformes aparecem no **masculino** nos textos de status ("O TAB do tanque 92 está
  Incubado", "Os Coliformes estão Estriados"); no banco os valores continuam como antes
- As telas do TAB e dos Coliformes passaram a mostrar compostas de embarque
  (`O.SKY 133 linha 2 fase 2 (A1-A5)`) e tanques de NFC, além das compostas de load
- `vw_compostas` reúne as compostas de recebimento e de embarque; `loads.fabrica_id` deixou de ser
  obrigatório
- Os arquivos `LabFlow_importar_n8n*.json` (com IDs reais) ficam todos fora do Git

### Security
- Regras também no banco: composta de load **ou** de embarque, teste de exatamente um alvo
  (composta, tanque, lote ou amostra), Howard sempre par (`percentual = campos_positivos × 2`),
  resultado repetido de C.T/B.L corrige o anterior em vez de duplicar
- Gravações novas pedem "sim" (Howard, C.T/B.L, TAB e Coliformes); Consultor só consulta
- `scripts/sanitize-workflow.ps1` confere que nenhum ID real de credencial nem `instanceId` sobra no
  arquivo público

### Notes
- Tudo foi testado pelo WhatsApp em 04/10/2026, com dados fictícios
- O fallback de IA (Gemini) ainda **não conhece** os comandos do concentrado: mensagem livre sobre
  eles cai em "comando inválido". Os comandos precisam ser escritos no formato padrão
- Limites e Situação do Howard e do NFC, `leitura de hoje finalizada`, e-mail e Excel ficam para
  as próximas versões


## [1.0.0] - 2026-10-01

### Changed
- **Breaking (dados):** os dados saíram do Google Sheets e foram para o
  PostgreSQL (banco `labflow` no container `labflow-postgres` da stack). O
  workflow não tem mais nenhum node do Google Sheets: são 22 nodes Postgres,
  todos com parâmetros (`$1`, `$2`...), nunca com texto concatenado
- Os comandos e as respostas do bot continuam os mesmos. A coleta grava
  coleta + drops D5/D10/D15 + bag ou pote numa instrução só, e a conclusão
  de leitura grava o usuário que leu
- **Análise de tanque exige coleta:** o registro liga cada tanque à coleta
  mais recente até a data da análise. Se algum tanque não tiver coleta,
  nada é gravado e o bot responde "Análise não registrada: não há coleta
  ... Registre a coleta primeiro"
- Navio separado em nome e viagem (`O.SKY 123` = nome `O.SKY`, viagem `123`)
- Quem registrou, concluiu ou leu passa a ser guardado como usuário (chave
  estrangeira), e não como texto livre
- "Hoje" é `CURRENT_DATE` do banco (fuso `America/Sao_Paulo`), e a expiração
  de 10 minutos da confirmação é calculada pelo banco
- Workflow reorganizado em 8 blocos coloridos, com nomes padronizados:
  `BD ·` (banco), `Zap ·` (envia no WhatsApp), `Fim ·` (responde ao
  webhook) e `Montar resposta ...` (formata o texto)
- Texto do bot e prompt do Gemini: D5, D10 e D15 são "análises de drop",
  não "reanálises"

### Added
- `db/migrations/001_tanques.sql` (usuarios, navios, coletas, drops,
  arquivo_amostras, analises, confirmacoes) e `db/migrations/002_concentrado.sql`
  (recebimento, embarque, compostas, TAB, Coliformes e Howard; rascunho,
  ainda não aplicada)
- Usuário somente leitura `labflow_leitura`, para o DBeaver e para o Power BI
- Backup diário do banco (`scripts/backup-db.sh`: `pg_dump`, `cron` às 3h,
  14 dias de retenção), documentado em `docs/scripts.md`
- `docs/postgres-migracao.md` (plano e decisões) e `docs/handoff.md`
  (retomar o projeto em outro computador)
- `.gitignore`

### Fixed
- Dois `If` da IA comparavam texto fixo e davam sempre verdadeiro — ver Bug 25
- Duplicar o workflow trocou o caminho do webhook — ver Bug 26
- Referência a node com maiúscula diferente: a coleta gravava e a resposta
  falhava — ver Bug 27
- Telefone cadastrado com zero na frente aparecia como não cadastrado —
  ver Bug 28

### Security
- O banco confere as regras de novo, como segunda barreira: cargo válido
  (`CHECK`), coleta duplicada (`UNIQUE`), vínculo entre coleta, drop, arquivo
  e análise (chave estrangeira) e CT sem pré-leitura
- Consultas sempre parametrizadas, sem montar SQL com texto da mensagem
- Usuário da aplicação e usuário somente leitura separados, e o banco do
  LabFlow isolado do banco da Evolution API
- Senhas só no `.env` do servidor e em Credenciais do n8n; backups com
  permissão restrita (pasta `700`, arquivos `600`)

### Notes
- O servidor é de demonstração, com dados fictícios. O workflow antigo, do
  Google Sheets, continua no n8n **desativado**, como plano B: para voltar
  atrás, desative o novo e ative o antigo (os dois usam o caminho
  `labflow-registro` e não podem ficar ativos juntos)


## [0.9.0] - 2026-09-29

### Added
- A IA passa a cobrir todos os comandos, não só a coleta. Novas intenções
  no Gemini e no `Validar IA`:
  - consultas (`consulta_drops`, `consulta_analises_terra`,
    `consulta_analises_navio`, `consulta_bags`, `consulta_potes`): rodam
    direto, sem pedir "sim", porque só leem a planilha
  - `registro_analise` (frasco normal ou stress, terra ou navio)
  - `concluir_drops` (dia D5/D10/D15, terra ou navio)
  - `concluir_leitura` (pré ou final, CT/BL/WORT, normal ou stress): vai
    direto para o fluxo de leitura, que já lista as leituras e pede o
    "sim". A IA não pede uma segunda confirmação
  - `gerenciar_cargo` (troca de cargo por frase livre)
- Ajuda por tópico, sem IA: `comandos`, `comandos para drops`, `consultar
  análises`, `consultar leituras`, `consultar descarte`, `consultar cargos`
  e `consultar tanques` mostram só os comandos do assunto. Trecho novo
  no Code node, antes do `Gerenciar usuário`
- Mais jeitos de perguntar bags e potes ("bags de terra hoje", "descartar
  potes hoje", "quais potes posso descartar hoje")
- Permissão checada duas vezes: o `Validar IA` recusa na hora o Consultor
  que tenta gravar e quem não é Admin tentando trocar cargo (sem gastar
  um "sim"), e a regex do Code node continua sendo a barreira final. Para
  isso o Code node passa `nivelAtual` ao `Validar IA`
- Exemplos no prompt do Gemini (10 mensagens com a resposta esperada) e
  data de hoje preenchida automaticamente nos exemplos

### Changed
- Resposta de coleta: `Registro de tanque terra/navio efetuado com
  sucesso por <nome de quem enviou>`, seguida de tanques, data e total
- Mensagem de "não entendi" da IA ficou curta: `Comando inválido. Se
  desejar consultar a lista de comandos, escreva o que procura. Por
  exemplo: consultar drops`, com a lista de assuntos. Antes listava todos
  os formatos e poluía o chat
- `Validar IA` devolve `reenviarComando` (consulta e leitura) ou
  `comando_ia` (gravação com confirmação), e o resultado passa pelos Ifs
  `If Reenviar Consulta` e `If Tem Resposta IA`
- Regra do prompt: mensagem de coleta só com números e sem navio é coleta
  de terra, mesmo sem a palavra "terra"

### Removed
- Nodes do ramo `amostra` (sem entrada desde a 0.8.0)

### Fixed
- Troca de cargo por frase livre promovia "gerente" a Admin: a IA trocava
  a palavra pelo cargo válido mais parecido — ver Bug 23
- Apagar a linha de cabeçalho de uma aba ao limpar dados de teste fazia o
  próximo `Append` falhar — ver Bug 22
- Gemini leve respondia `desconhecido` para "coletei os tanques 60 e 61
  hoje" depois que o prompt ganhou mais intenções — ver Bug 24

### Security
- O cargo e o telefone da troca de cargo precisam estar escritos na
  mensagem original: o código confere o texto do usuário e ignora o que
  a IA "corrigiu". Sem isso, um erro de interpretação viraria promoção
- Toda gravação vinda da IA continua pedindo "sim" e passando pelas regras
  da regex na execução (cargo, limites, duplicata)


## [0.8.0] - 2026-09-29

### Added
- IA como fallback da regex (Gemini): mensagem que nenhuma regex reconhece
  vai para o node `Message a model Interpretar IA`, que devolve um JSON
  (`intencao`, `tanques`, `navio`, `data`). Hoje entende coleta de terra e
  de navio, inclusive frases livres ("coletei os tanques 42 e 43 hoje") e
  nome de navio sem a palavra "navio"
- Node `Validar IA`: confere o JSON com as mesmas regras da regex (tanques
  válidos, limites de 8 e 16, data `dd/mm/aaaa`, navio obrigatório) e monta
  o comando no formato padrão
- Confirmação antes de executar: o bot mostra o comando entendido e pede
  "sim" ou "não". A pendência usa a aba `CONFIRMACOES_PENDENTES` (`IDs =
  IA`, `Resumo` = comando), com a mesma expiração de 10 minutos
- Reenvio do comando confirmado ao próprio webhook (`labflowReenvio:
  true`), para executar pela regex normal. Se ainda não for reconhecido,
  responde erro em vez de voltar à IA (sem loop)
- Aviso "A IA está indisponível" quando o Gemini falha; `Retry On Fail`
  com 5 tentativas e 3 s de espera
- Node `If Tem Resposta`: pula o envio de WhatsApp quando não há texto de
  resposta (caso da confirmação da IA), mas continua respondendo ao
  webhook
- Documentação: `docs/arquitetura.md` (seção da IA), `docs/comandos.md`
  (seção 11) e Bugs 20 e 21 em `docs/troubleshooting.md`

### Changed
- `Processar Confirmacao` reconhece pendência da IA (`IDs = IA`) e devolve
  `reenviarComando`
- `scripts/audit-workflow.py`: um HTTP Request que reenvia para o próprio
  webhook do workflow não exige `Respond to Webhook` depois, porque a
  resposta ao webhook original sai por outro ramo e a chamada abre uma
  execução própria
- Nodes `Update Row ANALISES` renomeados para `... Pre` e `... Final`
- Modelo do Gemini trocado para uma variante Flash-Lite depois de falhas
  de disponibilidade

### Removed
- **Breaking:** comando de registro de amostra avulsa (`amostra <número>
  ...`). As amostras do laboratório serão o recebimento e o embarque, em
  planilha própria. Uma mensagem sem comando reconhecido agora vai para a
  IA em vez de virar amostra. O ramo `amostra` ainda existe no canvas do
  n8n, sem entrada, e a aba `AMOSTRAS` está sem uso; ambos serão apagados

### Fixed
- Mensagem "fantasma" no WhatsApp depois de confirmar um comando da IA:
  texto vazio no `HTTP Request Confirmar Resposta` gerava erro 400 e a
  Evolution API reenviava o "sim" — ver Bug 20
- Falha do Gemini (503) aparecia como "Não entendi a mensagem" — ver Bug 21

### Security
- A IA não grava dados: só sugere um comando, que precisa de confirmação e
  passa pelas regras de sempre (cargo, limites, duplicata) na execução do
  comando reenviado
- O `LabFlow.json` continua sem segredos: a credencial do Gemini fica no
  n8n, e o arquivo público traz só o placeholder `GEMINI_CREDENTIAL_ID`


## [0.7.0] - 2026-09-25

### Added
- Conclusão de leituras de análise via WhatsApp (`Concluir [pre|final]
  leitura [CT|BL|WORT] [normal|stress] terra|navio [nome]`), com
  confirmação em duas etapas: o bot lista as leituras que vencem hoje e
  só altera a aba `ANALISES` depois de uma resposta "sim"; "não" cancela
  e a pendência expira em 10 minutos
- Colunas `Pre-Leitura Feita Por` e `Leitura Final Feita Por` na aba
  `ANALISES`, preenchidas com o nome de quem confirmou a leitura; a
  resposta de confirmação mostra "Leitura feita por: <nome>"
- Nova aba `CONFIRMACOES_PENDENTES` (`Numero, IDs, NovosStatus, Resumo,
  Criado Em`) para guardar a pendência entre as duas mensagens
- Script `scripts/audit-workflow.py`, que audita o `LabFlow.json`:
  conexões para nodes inexistentes, nodes órfãos, HTTP Request sem
  `Respond to Webhook`, placeholder `PRECISA_RESELECIONAR` e espaço antes
  de `{{`; com `--public`, também dados sensíveis (ID de planilha e de
  credencial, `instanceId`, `pinData`, telefone, e-mail, chave de API).
  Documentado em `docs/scripts.md`
- GitHub Action (`.github/workflows/audit-workflow.yml`) que roda a
  auditoria a cada alteração do `LabFlow.json`
- Consulta de análises do dia marca com ✅ as leituras já feitas e mostra
  o total no fim (ex: "✅ = lido (2 de 5)"); para o WORT, o tanque só
  ganha ✅ quando Profundidade e Superfície estão lidas
- Confirmação do registro de análise mostra a data da leitura final do
  CT (`Data final CT`)

### Fixed
- Pendências de confirmação nunca expiravam: `toLocaleString('pt-BR')`
  grava `"25/09/2026, 21:08:28"` (com vírgula depois do ano), e a leitura
  por `split(' ')` transformava o ano em `NaN`, fazendo `NaN > 10` ser
  sempre falso. Agora a data é lida por regex (com ou sem vírgula) e
  convertida para UTC; se não der para ler, a pendência é tratada como
  expirada
- Caminho de cargo negado sem `Respond to Webhook`
- Nodes criados depois do export apontavam para `PRECISA_RESELECIONAR`
  no campo Sheet, e a gravação na aba `CONFIRMACOES_PENDENTES` falhava —
  ver Bug 16
- Espaço no começo de algumas respostas do WhatsApp, vindo de espaços
  entre `=` e `{{` no campo `text` dos HTTP Request — ver Bug 17
- Comando de análise com "tanque terra 40" gravava o tanque como
  `TERRA 40`; a palavra "terra" agora é opcional na regex e fica fora da
  captura
- Consulta de análises repetia o tanque no WORT ("Tanques 99 e 99"),
  porque Profundidade e Superfície eram somadas na mesma lista
- "Leitura feita por" gravado na coluna errada por um campo que não foi
  trocado ao duplicar o node de Update Row — ver Bug 19

### Security
- Conclusão de leitura bloqueada para o cargo Consultor, como os demais
  comandos de registro


## [0.6.0] - 2026-09-23

### Added
- Coleta de terra com vários tanques numa única mensagem (até 8), no
  mesmo padrão de lista + `Split Out` do `coleta_navio`; mensagem com um
  tanque só continua funcionando (compatível com o formato antigo)
- Registro de análises de tanque via WhatsApp (`Analise do normal/stress
  do(s) tanque(s) <lista> [navio <nome>], data <dd/mm/aaaa>`), aceitando
  lista de tanques (até 8 terra / 16 navio). Cada tanque gera 4 linhas
  na nova aba `ANALISES`: CT Profundidade, BL Profundidade, WORT
  Profundidade e WORT Superfície, com datas de pré-leitura e leitura
  final calculadas automaticamente
- Consulta de análises do dia (`Quais analises de tanques terra/navio
  saem hoje?`), agrupando por sub-análise + prazo em horas + tipo de
  frasco (Normal/Stress), com WORT Profundidade e Superfície juntos numa
  linha só (exibido como "Psicrotroficos")
- Cargo **Consultor**: acesso só de consulta, bloqueado de registrar
  coleta/análise
- Conclusão de drops em lote via WhatsApp (`Concluir drops [D5|D10|D15]
  terra|navio [nome do navio]`): muda para `Concluído` todas as linhas de
  `DROPS` pendentes com data prevista hoje que batem no filtro, e
  responde com a lista de tanques concluídos

### Changed
- Nomes de navio aceitam o número da viagem junto (ex: `O.SKY 123`), sem
  mudança de código: o nome já era capturado como texto livre

### Fixed
- Cálculo de "hoje" usando o relógio UTC do container: à noite (depois das
  21h em Brasília) as consultas do dia já olhavam o dia seguinte.
  Corrigido com `toLocaleDateString('pt-BR', { timeZone:
  'America/Sao_Paulo' })` em todos os Code nodes de consulta — ver Bug 12
- `Get rows` de aba vazia não repassava nenhum item e a execução parava
  em silêncio (visto em `COLETAS_NAVIO`); corrigido ativando "Always
  Output Data" — ver Bug 14
- Conexões erradas introduzidas ao religar o fluxo manualmente para o
  bloqueio de duplicata (drops de terra sem gravar, ramos de erro ligados
  a nodes de gravação, `HTTP Request` sem `Respond to Webhook`) — ver
  Bug 15

### Security
- Número não cadastrado na aba `USUARIOS` é bloqueado por completo:
  recebe mensagem pedindo cadastro e nenhum comando é executado (antes
  só o comando de cargo checava permissão)
- Bloqueio de coleta duplicada: mesmo tanque + mesma data de coleta (e
  mesmo navio, no caso de navio) é recusado, informando quem já
  registrou; se algum tanque da lista já existir, a mensagem inteira é
  recusada sem gravar nada

## [0.5.0] - 2026-09-21

### Added
- Deploy migrado de Docker local (PC) para stack própria e isolada num
  VPS Linux compartilhado, cedido por um administrador externo — ver
  `docs/deploy-vps.md` para a arquitetura completa
- Rede Docker isolada (`labflow-net`), sem nenhum serviço compartilhado
  com os outros containers do servidor
- Imagens fixadas por versão: `postgres:15-alpine`, `n8nio/n8n:2.38.6`,
  `evoapicloud/evolution-api` fixada por digest (não por tag `latest`)
- `docs/comandos.md`: referência de todos os comandos reconhecidos pelo
  bot, com formato e exemplo de cada um

### Changed
- Credencial da Evolution API migrada de chave fixa em cada node HTTP
  Request para uma Credencial Header Auth do n8n, eliminando o segredo
  em texto puro nos exports do workflow
- Credencial do Google Sheets migrada de OAuth2 (expira a cada 7 dias em
  modo de teste) para conta de serviço (não expira, sem dependência de
  login por navegador)
- Instância do WhatsApp recriada no Evolution API do servidor
  (`labflow2`, mesmo nome), com o número reparado via QR code

### Fixed
- Webhook configurado pela tela do Manager do Evolution API não estava
  sendo persistido (retornava `null` ao consultar via API); corrigido
  configurando via chamada direta à API (`POST /webhook/set/<instancia>`)
  — ver Bug 11 em `docs/troubleshooting.md`

### Security
- Todos os segredos da stack do VPS (senha do Postgres, chave da API,
  chave de criptografia do n8n) gerados diretamente no servidor via
  `openssl rand`, nunca transmitidos por fora do terminal SSH
- Nenhum serviço da stack exposto publicamente: acesso administrativo
  (n8n, Manager do Evolution) restrito a túnel SSH, portas publicadas
  apenas em `127.0.0.1`

## [0.4.0] - 2026-09-18

### Added
- Gerenciamento de usuários/cargos via WhatsApp (comando `adicionar/trocar
  cargo <nivel> para o numero <numero> [nome <nome>]`, restrito a Admin),
  com aba `USUARIOS` no Google Sheets como fonte única de permissões
- Gravação via upsert (Append or Update Row): cria linha nova ou atualiza
  a existente sem duplicar
- Nome do usuário capturado automaticamente do WhatsApp ao alterar o
  próprio cadastro, ou informado manualmente ao cadastrar outra pessoa
  que ainda não mandou mensagem nenhuma
- Sincronização automática do campo `Nome`: qualquer usuário já
  cadastrado que manda qualquer mensagem (não só o comando de cargo) tem
  o nome atualizado sozinho na `USUARIOS`

### Fixed
- `HTTP Request` do caminho de sucesso lendo `$json.textoResposta` do
  node errado (o node de gravação no Sheets, em vez do Code node) depois
  de inserir a etapa de escrita nesse branch — causava erro 400 na
  Evolution API e execução duplicada por retry automático do webhook

### Changed
- Code node principal migrado de "Run Once for Each Item" para "Run Once
  for All Items", pra conseguir carregar a lista de usuários como entrada
  adicional junto com o payload do webhook

## [0.3.0] - 2026-09-17

### Added
- Rastreio de arquivo/descarte: novas abas `BAGS_TERRA` e `POTES_NAVIO`,
  calculando data de descarte previsto (data da coleta + 365 dias)
- Comandos de consulta `quais bags posso descartar hoje` e `quais potes
  navio posso descartar hoje`
- Validação de formato nos branches `coleta_terra` e `coleta_navio`
  (antes só o branch `amostra` tinha esse tratamento)

### Fixed
- Consulta de drops sempre retornando "nenhum drop previsto": comparação
  de campos da planilha `DROPS` era case-sensitive e não batia com o
  cabeçalho real (colunas em maiúsculas)
- IDs de drop duplicados entre tanques diferentes do mesmo navio:
  `Date.now()` trocado por composição a partir do `idColeta` (já único
  por tanque)

## [0.2.0] - 2026-09-16

### Added
- Suporte a `coleta_navio`: registro de 1 a 16 tanques de uma vez numa
  única mensagem, gerando uma linha por tanque em `COLETAS_NAVIO`
- Cálculo automático de datas de drop (D5/D10/D15), reaproveitado entre
  os branches `coleta_terra` e `coleta_navio`
- ID único por registro (`idRegistro`, formato `AM-<timestamp>`) e nome
  do responsável (via `pushName` da Evolution API) gravados na planilha

## [0.1.0] - MVP inicial - 2026-09-14

### Added
- Fluxo inicial: webhook da Evolution API → parsing de `amostra` via
  regex num Code node → validação → gravação no Google Sheets →
  confirmação de volta no WhatsApp

### Fixed
- Loop de mensagens / instância travando por resync de histórico do
  WhatsApp Multi-Device
- Filter nativo do n8n descartando mensagens reais por causa do campo
  `status`
- Resposta de confirmação indo pro número errado (campo `sender` da
  Evolution API é o número da própria instância, não de quem enviou)

<!--
  Nota: as versões 0.1.0 a 0.3.0 acima foram reconstruídas a partir das
  datas registradas em docs/troubleshooting.md — ajusta se lembrar de
  algo com data diferente. A entrada 0.1.0 provavelmente cobre mais coisa
  do que só os 3 bugs listados (o que estava no seu arquitetura.md antes
  de virar troubleshooting.md) — vale completar com o que fez sentido pra
  você marcar como "MVP".
-->
