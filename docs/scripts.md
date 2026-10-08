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

O que os testes cobrem (208 casos; 9 são do alerta de erro, em `tests/alerta-erro.test.js`, e 107 da IA, em `tests/validar-ia.test.js`):

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

Os testes foram validados injetando defeitos de propósito numa cópia do workflow (prazo do BL, limite de tanques, prazo de descarte, permissão do Consultor): todos fizeram algum teste falhar.

A GitHub Action [`testes.yml`](../.github/workflows/testes.yml) roda `npm test` a cada mudança no `LabFlow.json` ou em `tests/`.

**Limite conhecido:** os nodes `Montar ...` (que formatam a resposta) ainda não têm teste automático.

## gerar-teste-prompt-ia.js (regressão do prompt do Gemini)

Arquivo: [`scripts/gerar-teste-prompt-ia.js`](../scripts/gerar-teste-prompt-ia.js)

O Gemini não roda offline, então o prompt é testado no próprio n8n. O script gera um workflow descartável com **o mesmo prompt do bot** (lido do arquivo de importação) e uma lista de frases com o resultado esperado; o workflow manda uma frase por vez ao Gemini (4 s entre elas) e o node **Placar** mostra quantas acertou e, nas erradas, a frase, o esperado e o obtido.

```powershell
node scriptsgerar-teste-prompt-ia.js LabFlow_importar_n8n.json LabFlow_importar_n8n_teste_ia.json
```

Importar no n8n como workflow novo, **Execute workflow** e ler o node Placar; depois apagar o workflow. Os dois arquivos têm IDs reais e ficam fora do Git. As frases ficam no próprio script (diferentes dos exemplos do prompt, para medir generalização, incluindo frases em estilo de áudio e as intenções antigas). Rodar depois de **qualquer** mudança no prompt. Em 05/10/2026: 44 de 44.

## gerar-painel-powerbi.js (painel do Power BI como código)

Arquivo: [`scripts/gerar-painel-powerbi.js`](../scripts/gerar-painel-powerbi.js)

Gera o painel do laboratório no projeto `powerbi/labflow.pbip` (formato PBIP: relatório em JSON/PBIR e modelo em TMDL, versionados no Git). Escreve o tema (modo escuro), as medidas e colunas calculadas do modelo e as 9 páginas (Visão geral, Coletas, Tanques, Drops, Desvios, Recebimento, Embarque, TAB e Coliformes), todas no mesmo padrão: cabeçalho e cartões em HTML, filtros no topo, 3 gráficos e uma tabela. Cabeçalho, cartões e as barras de andamento são HTML montado por medida DAX e mostrado pelo visual **HTML Content Secure** (AppSource, certificado, sem scripts).

```powershell
node scripts\gerar-painel-powerbi.js
```

- **Com o Power BI fechado.** Pode rodar de novo: recria tudo sem duplicar. Os identificadores (páginas, visuais, filtros e `lineageTag` das medidas) são fixos, tirados do nome, então rodar de novo sem mudar nada não altera nenhum arquivo, e o diff do Git mostra só o que mudou de verdade.
- **Só o visual, com o Power BI aberto** (e já salvo com Ctrl+S): `node scripts\gerar-painel-powerbi.js --so-relatorio` não toca no modelo; depois, recarregar no Power BI (ou fechar **sem salvar** e abrir de novo).
- Confere os nomes antes de gravar: coluna calculada ou medida com o mesmo nome de uma coluna do banco (maiúscula e minúscula contam igual) para o script com erro ([Bug 32](troubleshooting.md)).
- Não mexe nas tabelas de apoio (Loads, Embarques, Calendário) nem nas ligações: essas são do Power BI Modeling MCP.
- `scripts/gerar-painel-powerbi-colorido.js` é o backup da versão colorida (fundo azul-marinho), caso o modo escuro seja descartado.

## sanitize-workflow.ps1

Arquivo: [`scripts/sanitize-workflow.ps1`](../scripts/sanitize-workflow.ps1)

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

- `pg_dump -Fc` (formato compactado, restaurado com `pg_restore`) para `~/labflow/backups/labflow_AAAA-MM-DD_HHMM.dump`
- arquivo vazio conta como falha: o script apaga o arquivo e sai com erro
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
