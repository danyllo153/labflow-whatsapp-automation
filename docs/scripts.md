# Scripts

## audit-workflow.py

Arquivo: [`scripts/audit-workflow.py`](../scripts/audit-workflow.py)

Audita o workflow exportado do n8n antes de ele ir para o repositório. Só usa a biblioteca padrão do Python (3.8+).

```bash
python scripts/audit-workflow.py LabFlow.json            # estrutura
python scripts/audit-workflow.py LabFlow.json --public   # estrutura + dados sensíveis
```

| Nível | Checagem | Por quê |
|---|---|---|
| ERRO | Conexão para node inexistente | Sobra de node apagado |
| ERRO | Node sem conexão de entrada | Parte do fluxo nunca executa ([Bug 15](troubleshooting.md)) |
| ERRO | HTTP Request sem Respond to Webhook depois | Execução fica pendurada e a Evolution API reenvia a mensagem ([Bug 15](troubleshooting.md)). Exceção: HTTP Request que chama o próprio webhook do workflow (reenvio do comando confirmado da IA), porque a resposta ao webhook original sai por outro ramo e a chamada abre uma execução própria |
| ERRO | Placeholder `PRECISA_RESELECIONAR` | Aba criada depois do export, não reselecionada no node |
| AVISO | Espaço entre `=` e `{{` | Os espaços viram texto fixo na mensagem |
| AVISO | Node desativado | Pode ter sido esquecido |
| ERRO (`--public`) | ID de planilha, ID de credencial, `instanceId`, `pinData`, telefone, e-mail, chave de API em texto puro | O arquivo é público no GitHub |

Sai com código `1` se houver algum erro. Por isso a GitHub Action em [`.github/workflows/audit-workflow.yml`](../.github/workflows/audit-workflow.yml) roda o script a cada upload do `LabFlow.json` e marca o commit com ❌ quando algo falha.

## Testes dos Code nodes (`tests/`)

Arquivos: [`tests/interpretar-comando.test.js`](../tests/interpretar-comando.test.js) e [`tests/helpers/executar-node.js`](../tests/helpers/executar-node.js)

Executa o `jsCode` **real** do node `Interpretar comando` (extraído do `LabFlow.json`) com mensagens de exemplo, sem n8n, sem banco e sem WhatsApp. O executor simula só o que o node usa do n8n (`$('Webhook WhatsApp')` e `$input`). Não precisa instalar nada além do Node 22 ou mais novo: usa o executor de testes que já vem com ele.

```powershell
npm test
```

O que os testes cobrem (321 casos; 10 das fábricas, navios e tanques, em `tests/fabricas-nomes.test.js`; 36 da ajuda, em `tests/ajuda.test.js`; 31 da IA resiliente e da fala, em `tests/ia-resiliente.test.js`; 9 são do alerta de erro, em `tests/alerta-erro.test.js`, e 107 da IA, em `tests/validar-ia.test.js`):

- **Reconhecimento:** cada comando da referência ([comandos.md](comandos.md)) cai na intenção (`tipo`) certa.
- **Campos extraídos:** lotes, compostas, navio/linha/fase, grupos de C.T/B.L com o sinal (`<` nunca vira igual), data da coleta do TAB de NFC.
- **Prazos de negócio:** D5/D10/D15, descarte em 365 dias, CT 48h, BL 72/120h, WORT 120/240h.
- **Recusas:** 9 tanques (limite 8), Howard com porcentagem ímpar.
- **Permissões:** não cadastrado, Consultor, Operador e Admin (a permissão é do código, nunca do prompt: Bug 23).
- **IA:** frase livre vai para o Gemini, a mensagem reenviada não entra em loop, mensagem do próprio bot é ignorada.
- **Alerta de erro:** formato da mensagem, máscara de números longos, corte em 300 caracteres, um aviso por Admin, nenhum aviso sem Admin e a janela de 10 minutos contra repetição.
- **IA (node `Validar resposta da IA`):** com respostas simuladas do Gemini: cada formato do catálogo da IA ([`tests/catalogo-ia.js`](../tests/catalogo-ia.js), um exemplo de cada comando novo) é reconhecido pela regex e recebe a classe certa (consulta direto, "sim" da IA ou "sim" do próprio comando); Consultor só consulta; formato fora do catálogo é recusado; dado faltando vira pergunta; intenções antigas sem mudança. Validado com defeito injetado (recebimento sem "sim": 3 testes falharam).

Para testar outro arquivo, por exemplo o de importação, antes de subir no n8n:

```powershell
$env:LABFLOW_JSON = 'LabFlow_importar_n8n.json'; npm test
```

- **IA resiliente e fala (	ests/ia-resiliente.test.js):** o desenho da cadeia (Gemini, Groq, Gemini 3.8, limite diário, atalho), tempo máximo e saída de erro de cada chamada, nenhuma chave no arquivo, o normalizador de resposta de cada provedor, o limite atingido, o Validar com limite e erro, o áudio em arquivo, e o pré-tratamento da fala com as frases reais do piloto (menor que 10, lotes 11 a 16, Lod 43 699, ditado de C.T, recebimento ditado).

Os testes foram validados injetando defeitos de propósito numa cópia do workflow (prazo do BL, limite de tanques, prazo de descarte, permissão do Consultor): todos fizeram algum teste falhar.

A GitHub Action [`testes.yml`](../.github/workflows/testes.yml) roda `npm test` a cada mudança no `LabFlow.json` ou em `tests/`.

**Limite conhecido:** os nodes `Montar ...` (que formatam a resposta) ainda não têm teste automático.

## gerar-teste-prompt-ia.js (regressão do prompt do Gemini)

Arquivo: [`scripts/gerar-teste-prompt-ia.js`](../scripts/gerar-teste-prompt-ia.js)

O Gemini não roda offline, então o prompt é testado no próprio n8n. O script gera um workflow descartável com **o mesmo pedido do bot** (o prompt é lido do node `IA · Montar pedido` do arquivo de importação e a chamada copia o `IA · Gemini texto`) e uma lista de **60 frases** com o resultado esperado; o workflow manda uma frase por vez ao Gemini (4 s entre elas) e o node **Placar** mostra quantas acertou e, nas erradas, a frase, o esperado e o obtido.

```powershell
node scripts\gerar-teste-prompt-ia.js LabFlow_importar_n8n_ia.json LabFlow_importar_n8n_teste_ia.json
```

**Rodar pelo servidor** (sem abrir a tela do n8n): copiar o arquivo gerado, `docker exec labflow-n8n n8n import:workflow --input=/tmp/arquivo.json` (o script já põe um `id`), achar o id com `n8n list:workflow` e executar:

```bash
docker exec -d labflow-n8n sh -c "N8N_RUNNERS_BROKER_PORT=5791 N8N_RUNNERS_ENABLED=false n8n execute --id=<id> --rawOutput > /tmp/placar-ia.json"
```

As duas variáveis são necessárias: sem elas o comando tenta abrir a mesma porta do n8n que está no ar e falha. Leva uns 10 minutos; o resultado (JSON do node Placar) sai no arquivo. Depois **apagar o workflow de teste** (pela tela do n8n; o servidor não tem comando para apagar). Os dois arquivos têm IDs reais e ficam fora do Git. As frases ficam no próprio script (diferentes dos exemplos do prompt, para medir generalização, incluindo frases em estilo de áudio, fábricas por nome de cidade, navio `Orange Sky` e as consultas novas). Rodar depois de **qualquer** mudança no prompt.

Histórico: 05/10/2026, 44 de 44 (prompt antigo). 14/10/2026, prompt atual (fábricas travadas, navios, tanques e consultas): **duas rodadas em 14/10 (24 e 27 de 60), com muitos `503` do Google: 46 das 60 frases foram acertadas em pelo menos uma rodada, nenhuma resposta veio errada e 14 frases nunca receberam resposta** (não testadas). Prompt sem regressão detectada; falta só repetir as 14 sem resposta, uma rodada de cada vez e em hora calma.

## gerar-painel-powerbi.js (painel do Power BI como código)

Arquivo: [`scripts/gerar-painel-powerbi.js`](../scripts/gerar-painel-powerbi.js)

Gera o painel do laboratório no projeto `powerbi/labflow.pbip` (formato PBIP: relatório em JSON/PBIR e modelo em TMDL, versionados no Git). Escreve o tema (modo escuro), as medidas e colunas calculadas do modelo e as páginas (Visão geral, Coletas, Análise TT e T.N, Drops, Desvios, Recebimento, **Recebimento NFC**, Embarque, TAB e Coliformes), todas no mesmo padrão: cabeçalho e cartões em HTML, filtros no topo, 3 gráficos e uma tabela. Cabeçalho, cartões e as barras de andamento são HTML montado por medida DAX e mostrado pelo visual **HTML Content Secure** (AppSource, certificado, sem scripts).

```powershell
node scripts\gerar-painel-powerbi.js
```

- **Com o Power BI fechado.** Pode rodar de novo: recria tudo sem duplicar. Os identificadores (páginas, visuais, filtros e `lineageTag` das medidas) são fixos, tirados do nome, então rodar de novo sem mudar nada não altera nenhum arquivo, e o diff do Git mostra só o que mudou de verdade.
- **Só o visual, com o Power BI aberto** (e já salvo com Ctrl+S): `node scripts\gerar-painel-powerbi.js --so-relatorio` não toca no modelo; depois, recarregar no Power BI (ou fechar **sem salvar** e abrir de novo).
- Confere os nomes antes de gravar: coluna calculada ou medida com o mesmo nome de uma coluna do banco (maiúscula e minúscula contam igual) para o script com erro ([Bug 32](troubleshooting.md)).
- Não mexe nas tabelas de apoio (Loads, Embarques, Calendário) nem nas ligações: essas são do Power BI Modeling MCP.
- `scripts/gerar-painel-powerbi-colorido.js` é o backup da versão colorida (fundo azul-marinho), caso o modo escuro seja descartado.

## tunel-powerbi.ps1 (túnel do Power BI sempre de pé)
Arquivo: [`scripts/tunel-powerbi.ps1`](../scripts/tunel-powerbi.ps1)
Mantém o túnel SSH `localhost:15432` para o banco do servidor e reconecta sozinho em 10 segundos se cair. Descobre o IP do banco a cada tentativa (continua valendo se o contêiner for recriado). Precisa do apelido `labflow` no `~/.ssh/config` (chave SSH, sem senha).
Para iniciar com o Windows (uma vez por computador, num PowerShell comum):
```
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "C:\Dev\labflow-whatsapp-automation\scripts\tunel-powerbi.ps1"'
Register-ScheduledTask -TaskName 'LabFlow tunel Power BI' -Action $acao -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)) -Force
Start-ScheduledTask -TaskName 'LabFlow tunel Power BI'
```
Parar e remover: `Unregister-ScheduledTask -TaskName 'LabFlow tunel Power BI' -Confirm:$false`. Testar: `(Test-NetConnection 127.0.0.1 -Port 15432).TcpTestSucceeded`.
## gerar-excel-labflow.ps1 (Excel só de leitura sobre o banco)

Arquivos: [`scripts/gerar-excel-labflow.ps1`](../scripts/gerar-excel-labflow.ps1) e [`scripts/excel-labflow.config.json`](../scripts/excel-labflow.config.json) (as abas, os SQL, os rótulos e os gráficos, em UTF-8 com acento).

Gera o `LabFlow-Excel.xlsx` (em `OneDrive\Valts\estudos-labflow\excel`, fora do Git) **com a cara do painel do Power BI** (tema claro "LabFlow claro", desde 23/10/2026): em toda aba um cabeçalho com **botões de navegação** entre as abas, **cartões arredondados** (número grande, ícone e selo colorido) e gráficos no tema (cores de Terra, Navio, Atrasado, Lido... iguais às do Power BI). A aba **Painel** (Visão geral) tem 8 cartões, o andamento das leituras de NFC, os atrasados por área, a rosca da situação das leituras com o total no meio, as coletas por dia (terra e navio) e os testes por mês; cada aba de análise (Coletas, Drops, Desvios, TAB, Coliformes, C.T e B.L, Placas NFC e Recebimento NFC) tem 4 cartões, dois **gráficos de tendência** e, embaixo, a tabela com **o registro mais recente na primeira linha**. Abas escondidas: Tendencias (dados) e Calculos (os números dos cartões e do painel). Textos, cartões e cores ficam no JSON; o `.ps1` fica só em ASCII (o PowerShell 5.1 lê script sem BOM como ANSI). Tudo lê as views `bi.*` pelo usuário `labflow_leitura`; o arquivo **só lê** (corrigir dado é pelo app, pelo bot ou por um Admin).

Pré-requisitos (uma vez por computador): driver **psqlODBC x64** (`psqlodbc_x64.msi`, do site do PostgreSQL), o túnel do banco aberto em `localhost:15432` (`tunel-powerbi.ps1`) e o **Excel fechado**.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\gerar-excel-labflow.ps1
```

A **senha do `labflow_leitura` não vai para o arquivo nem para o script**: na primeira vez o Excel pergunta (Dados > Atualizar Tudo, aba Banco de Dados) e guarda no Windows; depois é só Atualizar Tudo. Para refazer o visual, edite o JSON e rode de novo. `-Pdf caminho.pdf` também exporta um PDF. Com o Excel aberto o script se recusa a rodar; para testar o visual sem fechar, gere em outro caminho com `-ExcelAberto -Saida C:\temp\teste.xlsx`.

## gerar-gif.py (GIFs do README: painel e bot)

Arquivo: [`scripts/gerar-gif.py`](../scripts/gerar-gif.py)

Junta prints numerados de uma pasta (`01-...png`, `02-...png`...) num GIF em loop. Prints de tamanhos diferentes são centralizados num fundo da cor do próprio print, sem esticar. Usado para `docs/img/powerbi/painel.gif` (9 páginas do painel, tiradas em **Tela inteira** no Power BI web) e `docs/img/bot/bot.gif` (conversa no WhatsApp, sem o número do bot). Precisa do Pillow.

```powershell
py -m pip install --user pillow
py scripts/gerar-gif.py docs/img/powerbi docs/img/powerbi/painel.gif
py scripts/gerar-gif.py docs/img/bot docs/img/bot/bot.gif --largura 900 --tempo 4500
```

Depois de trocar algum print, rodar de novo. Prints sem barra do navegador, sem dados da conta e sem o número do bot.

## sanitize-workflow.ps1

Arquivo: [`scripts/sanitize-workflow.ps1`](../scripts/sanitize-workflow.ps1)

Troca o ID real de cada credencial por um placeholder **do tipo** (`GEMINI_CREDENTIAL_ID`, `EVOLUTION_CREDENTIAL_ID`, `POSTGRES_CREDENTIAL_ID`); credenciais do mesmo tipo (chave em cabeçalho) são distinguidas pelo **nome**: `Groq API` vira `GROQ_CREDENTIAL_ID`. Para um nome novo, acrescente em `$porNome`. Também remove `settings.errorWorkflow` (a ligação do alerta de erro é da instância; ao importar o arquivo com IDs reais, ele precisa ser religado em Settings → Error workflow, ou vir já no arquivo de importação).

Gera o `LabFlow.json` **público** a partir do export do n8n com IDs reais (`LabFlow_importar_n8n.json`, que nunca vai para o Git). Roda no Windows PowerShell 5.1.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\sanitize-workflow.ps1 `
    -Entrada LabFlow_importar_n8n.json -Saida LabFlow.json
python scripts/audit-workflow.py LabFlow.json --public
```

- Troca o ID real de cada credencial por um placeholder (`GEMINI_CREDENTIAL_ID`, `EVOLUTION_CREDENTIAL_ID`, `POSTGRES_CREDENTIAL_ID`) e remove `meta.instanceId`. Se aparecer um tipo de credencial novo, o script para e pede o placeholder.
- Grava no mesmo formato do arquivo versionado (JSON indentado, terminando em LF), para o diff do Git mostrar só o que mudou.
- Para se houver `pinData` (dados fixados no n8n), ou se sobrar algum ID real no resultado.

O script é **só ASCII**: o Windows PowerShell 5.1 lê arquivo sem BOM como Windows-1252 e estraga acentos (já aconteceu, ver [Bug 29](troubleshooting.md)). Texto com acento deve vir de arquivos lidos como UTF-8.

## backup-db.sh

Arquivo: [`scripts/backup-db.sh`](../scripts/backup-db.sh)

Backup diário do banco `labflow`. Roda **no servidor**, em `~/labflow/backup-db.sh`, chamado pelo `cron` todo dia às 3h (o servidor está no fuso de Brasília).

- `pg_dump -Fc` (formato compactado, restaurado com `pg_restore`) para `~/labflow/backups/labflow_AAAA-MM-DD_HHMM.dump`, feito pelo **administrador do banco** (`evolution`, o `POSTGRES_USER` do conteiner): desde a migration `050` o app tem o schema `app`, que o `labflow_app` nao le (com ele o dump falhava e saia arquivo vazio, 20 e 21/10/2026)
- falha, arquivo vazio ou arquivo sem a lista de tabelas contam como erro: o script apaga o arquivo, escreve `ERRO: backup falhou` no log e sai com codigo 1 (nunca deixa arquivo vazio parecendo backup bom)
- apaga backups com mais de 14 dias
- `umask 077`: o arquivo só pode ser lido pelo dono (o backup tem todos os dados do bot); a pasta `backups` também é `700`

Instalar ou atualizar (do PC, na pasta do repositório):

```powershell
scp scripts\backup-db.sh dan@IP-DO-SERVIDOR:~/labflow/
```

No servidor:

```bash
chmod 700 ~/labflow/backup-db.sh
~/labflow/backup-db.sh                       # rodar uma vez na mão
(crontab -l 2>/dev/null; echo "0 3 * * * /home/dan/labflow/backup-db.sh >> /home/dan/labflow/backups/backup.log 2>&1") | crontab -
crontab -l                                   # conferir o agendamento
tail ~/labflow/backups/backup.log            # resultado das últimas noites
```

Conferir se um backup é válido, sem restaurar nada (lista as tabelas dentro do arquivo):

```bash
docker exec -i labflow-postgres pg_restore --list < ~/labflow/backups/ARQUIVO.dump | grep "TABLE DATA"
```

Restaurar (apaga e recria as tabelas do banco `labflow` com o conteúdo do backup):

```bash
docker exec -i labflow-postgres pg_restore -U labflow_app -d labflow --clean --if-exists < ~/labflow/backups/ARQUIVO.dump
```

> O backup fica no mesmo servidor do banco: protege contra erro humano (apagar dados), não contra perda do servidor. Para isso, copiar periodicamente um `.dump` para fora do servidor com `scp`.
