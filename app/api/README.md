# LabFlow API

API do app LabFlow (o LIMS do laboratório), em **FastAPI (Python)**. Ela fica entre o app (web e celular) e o banco PostgreSQL do bot: **lê** as tabelas do bot por views e **grava** nelas só por funções do banco aprovadas.

- Especificação: [`docs/specs/lims/06-api-e-auth.md`](../../docs/specs/lims/06-api-e-auth.md), [`07-app-pwa.md`](../../docs/specs/lims/07-app-pwa.md) e [`08-fluxos.md`](../../docs/specs/lims/08-fluxos.md) (v1.0).
- Tarefas: [`rumo-do-app.md`](../../docs/specs/lims/rumo-do-app.md), seção "Tarefas da Fase B".
- Testes rodam no GitHub Actions (`.github/workflows/app-api.yml`) sempre que algo em `app/api/` muda.

## Rodar no Windows (PowerShell)

Um comando de cada vez, dentro da pasta do projeto.

1. Entrar na pasta da API:

```
cd C:\Dev\labflow-whatsapp-automation\app\api
```

2. Criar o ambiente do Python (só na primeira vez):

```
py -m venv .venv
```

3. Ativar o ambiente:

```
.venv\Scripts\Activate.ps1
```

4. Instalar as dependências (só na primeira vez ou quando `requirements*.txt` mudar):

```
pip install -r requirements-dev.txt
```

5. Rodar os testes:

```
python -m pytest -q
```

No seu computador, os testes que precisam do banco aparecem como **pulados** (`skipped`), porque não há banco de teste nele. No GitHub Actions eles **sempre rodam**: o CI sobe um PostgreSQL de teste, aplica todas as migrations de `db/migrations` e os dados fictícios de `db/seeds` (script `scripts/preparar_banco_teste.sh`). A API nunca aponta para o banco do servidor nos testes.

6. Ligar a API no seu computador:

```
uvicorn labflow_api.main:app --reload
```

Depois abra `http://127.0.0.1:8000/docs` no navegador: é a documentação automática da API, onde dá para testar cada rota. A rota `GET /saude` responde `{"status": "ok"}`.

## Rotas

| Rota | O que faz | Tarefa |
|---|---|---|
| `GET /saude` | Diz se a API está no ar (não toca no banco) | APP-001 |

O endereço do banco vem da variável de ambiente `LABFLOW_DB_URL` (APP-002). Nunca escreva senha no código nem no repositório.
