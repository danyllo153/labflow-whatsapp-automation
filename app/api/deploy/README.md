# Subir a API do app no servidor de demonstração (APP-011)

Spec: [06 — API e autenticação](../../../docs/specs/lims/06-api-e-auth.md), "Arquitetura". Fase de testes: **só o Danyllo**, pelo **Tailscale** (rede privada). Nada fica exposto na internet.

## Como fica

```text
Seu PC/celular (Tailscale ligado)
   └── https://labflow-app.<sua-tailnet>.ts.net   (HTTPS entregue pelo Tailscale)
         └── labflow-tailscale  (container, modo userspace, sem privilégios)
               └── labflow-api:8000  (FastAPI, usuário de banco labflow_app_web)
                     └── labflow-postgres:5432  (stack do bot, rede labflow-net)
```

- Stack **separada** (`docker compose -p labflow-app`): subir, parar ou apagar não mexe no Postgres, no n8n nem no Evolution.
- **Nenhuma porta publicada** no servidor e **nada instalado** no sistema do servidor: o Tailscale roda dentro de um container.
- O `labflow_app_web` **lê** as tabelas do bot e **grava só no schema `app`** (login). Não altera dado do bot.
- Memória: a API usa uns 50 MB (teto de 256 MB); o Tailscale, teto de 128 MB.

## Antes de começar (uma vez, no navegador)

1. Criar a conta grátis em [tailscale.com](https://tailscale.com) e instalar o Tailscale no PC (e no celular, se quiser testar nele).
2. No painel do Tailscale, em **DNS**: ligar **MagicDNS** e **HTTPS Certificates**.
3. Em **Settings → Keys → Generate auth key**: chave **não reutilizável**, validade curta (1 dia). Copiar e guardar só até o passo 6. **Nunca** colar a chave em chat, commit ou documento.

## No servidor (um comando por vez)

Entrar no servidor:

```
ssh labflow
```

### 1. Conferir antes de mexer

Memória livre (o servidor não tem swap; precisa sobrar uns 400 MB):

```
free -m
```

Nome real da rede da stack do bot (deve aparecer `labflow-net`; se aparecer outro nome, anotar para o passo 7):

```
docker network ls --filter name=labflow
```

Backup do banco antes da migration (regra do projeto):

```
~/labflow/backup-db.sh
```

```
ls -lt ~/labflow/backups | head -3
```

### 2. Baixar o código do app

```
git clone https://github.com/danyllo153/labflow-whatsapp-automation.git ~/labflow/app-src
```

(Se a pasta já existir: `git -C ~/labflow/app-src pull`.)

### 3. Carregar as variáveis do `.env` nesta janela

```
set -a; source ~/labflow/.env; set +a
```

### 4. Aplicar a migration 050 (schema `app` e usuário `labflow_app_web`)

Com o usuário administrador do banco (`POSTGRES_USER`):

```
docker exec -i labflow-postgres psql -U "$POSTGRES_USER" -d labflow -v ON_ERROR_STOP=1 < ~/labflow/app-src/db/migrations/050_app_login.sql
```

Conferir (deve mostrar `credenciais`, `senhas_provisorias` e `sessoes`):

```
docker exec labflow-postgres psql -U "$POSTGRES_USER" -d labflow -c '\dt app.*'
```

### 5. Senha do `labflow_app_web` (gerada no servidor, guardada só no `.env`)

```
(umask 077; echo "LABFLOW_APP_WEB_PASSWORD=$(openssl rand -hex 24)" >> ~/labflow/.env)
```

```
set -a; source ~/labflow/.env; set +a
```

```
echo "ALTER ROLE labflow_app_web LOGIN PASSWORD '$LABFLOW_APP_WEB_PASSWORD';" | docker exec -i labflow-postgres psql -U "$POSTGRES_USER" -d labflow
```

### 6. Chave do Tailscale (digitada sem aparecer na tela)

```
read -rsp "Chave do Tailscale: " K; (umask 077; echo "TS_AUTHKEY=$K" >> ~/labflow/.env); unset K; echo
```

### 7. Subir a API e o Tailscale

```
cd ~/labflow/app-src/app/api/deploy
```

```
docker compose -p labflow-app --env-file ~/labflow/.env -f docker-compose.app.yml up -d --build
```

Se no passo 1 a rede tinha outro nome, rodar antes `export LABFLOW_REDE=<nome>`.

Conferir (os dois `Up`; a API `healthy` depois de ~30 s):

```
docker ps --filter name=labflow-api --filter name=labflow-tailscale
```

```
docker logs labflow-tailscale --tail 20
```

### 8. Seu usuário de Admin no app (uma vez só)

Listar quem é Admin no bot:

```
docker exec labflow-api python -m labflow_api.primeiro_admin
```

Dar o usuário curto e gerar a senha provisória (trocar `<id>` pelo seu número da lista; o usuário é um exemplo):

```
docker exec labflow-api python -m labflow_api.primeiro_admin <id> danyllo
```

A senha provisória aparece **uma vez**, vale **24 horas** e serve para um login só.

### 9. Tirar a chave do Tailscale do `.env` (ela já foi usada; o login fica salvo no volume)

```
sed -i '/^TS_AUTHKEY=/d' ~/labflow/.env
```

## No PC: abrir e entrar

1. Com o Tailscale ligado, abrir `https://labflow-app.<sua-tailnet>.ts.net/docs` (o nome completo aparece no painel do Tailscale, em **Machines**).
2. `POST /login` → **Try it out** → usuário e senha provisória → **Execute**.
3. `POST /trocar-senha` → a senha nova (mínimo de 8 caracteres).
4. `GET /me` → deve mostrar seu nome, cargo `Admin` e `trocar_senha: false`.

## Atualizar depois de um PR novo do app

```
git -C ~/labflow/app-src pull
```

```
cd ~/labflow/app-src/app/api/deploy
```

```
docker compose -p labflow-app --env-file ~/labflow/.env -f docker-compose.app.yml up -d --build labflow-api
```

## Parar ou desfazer

Parar o app (o bot continua igual):

```
docker compose -p labflow-app --env-file ~/labflow/.env -f docker-compose.app.yml down
```

Desfazer a migration 050 (apaga só o schema `app` e o `labflow_app_web`; backup antes):

```
docker exec -i labflow-postgres psql -U "$POSTGRES_USER" -d labflow -v ON_ERROR_STOP=1 < ~/labflow/app-src/db/migrations/050_app_login_desfazer.sql
```

E tirar a máquina `labflow-app` no painel do Tailscale (**Machines → Remove**).
