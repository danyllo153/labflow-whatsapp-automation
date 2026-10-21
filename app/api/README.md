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
| `POST /login` | Entra com usuário curto e senha; abre a sessão num cookie seguro (30 dias sem uso); 5 senhas erradas seguidas bloqueiam por 15 min | APP-004 |
| `GET /me` | Quem sou eu: usuário, nome, cargo (lido de `usuarios` a cada chamada) e a lista `pode` com as ações que o cargo permite | APP-004, APP-005 |
| `POST /sair` | Encerra a sessão | APP-004 |
| `GET /admin/pessoas` | Só Admin: lista as pessoas cadastradas no bot com nome, cargo, usuário curto e situação (sem usuário no app, senha provisória pendente, ativo, bloqueado). Não mostra telefone | APP-007 |
| `PUT /admin/pessoas/{id}/usuario` | Só Admin: define ou troca o usuário curto (ex.: `ana.souza`) de quem já está cadastrado; depois, gerar a senha provisória | APP-007 |
| `POST /admin/pessoas/{id}/senha-provisoria` | Só Admin: gera uma senha provisória (ex.: `K7m4-Tq2p`, 24 h, uso único), derruba a senha antiga e as sessões abertas da pessoa | APP-006 |
| `GET /paginas/coletas` | Página Coletas (lê `bi.coletas`): filtros por período, origem, tanque, navio e quem coletou/digitou; paginação (até 200 por página). O Coletor vê só as próprias coletas | APP-008 |
| `GET /paginas/recebimento` | Página Recebimento (lê `bi.contagens`): filtros por período previsto, load, lote, fábrica, análise, situação (Ok, Não ok, Atrasado, Vence hoje, No prazo) e quem leu. O Coletor não vê | APP-008 |
| `GET /paginas/coletas/excel` e `GET /paginas/recebimento/excel` | Excel (`.xlsx`) do que está filtrado, com os mesmos filtros da página, sem paginação (até 50.000 linhas). Aba com os dados (cabeçalho laranja, filtro do Excel ligado) e aba "Filtros" com o que foi usado e a hora da exportação. Livre para todos que veem a página, sem registro | APP-009 |
| `GET /pendencias-hoje` | O que **vence hoje** e o que está **atrasado** (C.T/B.L, TAB, Coliformes, Howard, drops, leituras de NFC, recebimento NFC, desvios), nos blocos do relatório do dia, com os totais para os cartões do Início. Lê as views `bi.*`. Filtros: bloco e situação | APP-010 |
| `POST /trocar-senha` | Troca a senha. Depois de entrar com a provisória a troca é obrigatória (as outras rotas respondem "Troque sua senha antes de continuar"); na troca voluntária pede a senha atual. Mínimo de 8 caracteres; senha igual ao usuário é recusada | APP-006 |

As permissões por cargo (tabela do `07-app-pwa.md`) ficam num lugar só, `labflow_api/permissoes.py`; cada rota pede a ação com `Depends(exigir("..."))` (APP-005).

Para testar o login no seu PC sem HTTPS, ligue a API com `LABFLOW_COOKIE_SEGURO=0` (no servidor, o cookie só anda por HTTPS).

O endereço do banco vem da variável de ambiente `LABFLOW_DB_URL` (APP-002). Nunca escreva senha no código nem no repositório.

## Banco do app (APP-003)

A migration `db/migrations/050_app_login.sql` cria o schema `app` (credenciais, senhas provisórias e sessões) e o usuário de banco **`labflow_app_web`**, que **lê** as tabelas e views do bot e **grava só no schema `app`** (um teste prova que ele não consegue gravar nas tabelas do bot). Para desfazer: `050_app_login_desfazer.sql`. No servidor, ela é aplicada junto com a publicação da API (APP-011), com backup antes.

## Container e servidor (APP-011)

- `Dockerfile`: imagem da API (Python 3.12, usuário sem privilégios, healthcheck em `/saude`).
- `deploy/docker-compose.app.yml`: stack **separada** da do bot (`labflow-api` + `labflow-tailscale`), sem porta publicada; o acesso é só pelo Tailscale, em HTTPS.
- `deploy/README.md`: passo a passo no servidor, um comando por vez (backup, migration 050, senha do `labflow_app_web`, subir a stack e o primeiro login).
- Primeiro Admin (uma vez, dentro do container): `python -m labflow_api.primeiro_admin` lista os Admin do bot; `python -m labflow_api.primeiro_admin <id> <usuario.curto>` mostra a senha provisória.
