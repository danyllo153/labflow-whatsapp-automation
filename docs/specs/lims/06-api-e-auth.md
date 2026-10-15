---
title: LabFlow LIMS — API e autenticação
tags: [labflow, lims, spec, api, auth]
status: draft
version: v0.2
created: 2026-10-07
updated: 2026-10-15
---

# API e autenticação

**Navegação:** [Índice](index.md) · Anterior: [Banco e migrations](05-banco-e-migrations.md) · Próximo: [App (PWA)](07-app-pwa.md) · Bússola: [Rumo do app](rumo-do-app.md)

> v0.2 (15/10/2026): em revisão com o Danyllo, uma pergunta de cada vez. Registra o primeiro acesso e o cadastro de pessoas; o resto continua como proposta.

## Direção

Uma **API própria** fica entre o app e o banco. Ela **lê** as tabelas do bot por **views** e **grava** nelas só por **funções do banco** aprovadas (decisão de 15/10, ver [07](07-app-pwa.md)); nas tabelas do app (schema `app`) grava direto. O login usa os mesmos usuários e cargos do WhatsApp (tabela `usuarios`), com senha guardada só em hash.

## Primeiro acesso e cadastro de pessoas (decidido em 15/10)

- **Convite do Admin** (opção A): na tela **Admin → Pessoas**, o Admin cadastra a pessoa (**"Nova pessoa"**: nome, telefone, cargo e **usuário curto**, ex.: `ana.souza`) e toca em **"Cadastrar e gerar convite"**. O app mostra um **código de 8 letras e números**, válido por **24 horas** e de **uso único**, que o Admin entrega à pessoa.
- A pessoa abre o app, digita o **usuário** e o **código** e cria a **própria senha**. Daí em diante entra com **usuário e senha**.
- O login é pelo **usuário curto**, não pelo telefone (dado pessoal e ruim de digitar).
- A tela **Nova pessoa** sai **já na primeira versão** do app. Cadastrar e trocar cargo usam funções do banco compartilhadas com o bot (pedido **PB5** no [rumo](rumo-do-app.md)), que precisam estar prontas antes do lançamento.
- O **telefone continua obrigatório** (o bot identifica a pessoa pelo número; `usuarios.telefone` é obrigatório). Telefone opcional para quem usa só o app fica nas Ideias.

## Proposta (a confirmar)

- **FastAPI** (Python, sugerido) num container novo da stack `~/labflow`.
- Senha em hash (argon2) e sessão por cookie seguro ou token de curta duração.
- Permissão conferida na API a cada chamada, pelo cargo lido de `usuarios`, igual ao bot.
- Sem porta pública: acesso por Cloudflare Tunnel ou Tailscale.
- Testes automáticos da API desde o primeiro endpoint.

## Tabelas do login (schema `app`)

| Tabela | Para quê |
|---|---|
| `app.credenciais` | `usuario_id` → usuário curto, hash da senha, bloqueado, tentativas erradas |
| `app.convites` | Hash do código, validade, usado em, criado por |
| `app.sessoes` | Sessões abertas (quem, quando, validade, aparelho) |

## Primeiros endpoints (a revisar depois das perguntas)

- `GET /me` — quem sou e meu cargo
- `GET /minhas-coletas`, `GET /minhas-analises`
- `GET /pendencias-hoje`, `GET /relatorio-do-dia`

## Perguntas a responder

- [x] ~~Como o usuário cria a senha pela primeira vez~~ **Convite do Admin com código** (15/10).
- [ ] Recuperação de senha.
- [ ] FastAPI ou Node?
- [ ] Cloudflare Tunnel ou Tailscale?
