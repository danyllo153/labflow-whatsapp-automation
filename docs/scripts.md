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
| ERRO | HTTP Request sem Respond to Webhook depois | Execução fica pendurada e a Evolution API reenvia a mensagem ([Bug 15](troubleshooting.md)) |
| ERRO | Placeholder `PRECISA_RESELECIONAR` | Aba criada depois do export, não reselecionada no node |
| AVISO | Espaço entre `=` e `{{` | Os espaços viram texto fixo na mensagem |
| AVISO | Node desativado | Pode ter sido esquecido |
| ERRO (`--public`) | ID de planilha, ID de credencial, `instanceId`, `pinData`, telefone, e-mail, chave de API em texto puro | O arquivo é público no GitHub |

Sai com código `1` se houver algum erro. Por isso a GitHub Action em [`.github/workflows/audit-workflow.yml`](../.github/workflows/audit-workflow.yml) roda o script a cada upload do `LabFlow.json` e marca o commit com ❌ quando algo falha.
