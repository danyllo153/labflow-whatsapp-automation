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
