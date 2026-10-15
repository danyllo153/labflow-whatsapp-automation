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

> v0.2 (15/10/2026): em revisão com o Danyllo, uma pergunta de cada vez. Registra o primeiro acesso, o esqueci a senha, a sessão e o cadastro de pessoas; o resto continua como proposta.

## Direção

Uma **API própria** fica entre o app e o banco. Ela **lê** as tabelas do bot por **views** e **grava** nelas só por **funções do banco** aprovadas (decisão de 15/10, ver [07](07-app-pwa.md)); nas tabelas do app (schema `app`) grava direto. O login usa os mesmos usuários e cargos do WhatsApp (tabela `usuarios`), com senha guardada só em hash.

## Primeiro acesso, esqueci a senha e cadastro de pessoas (decidido em 15/10)

- **Senha provisória gerada pelo Admin** (ideia do Danyllo, no lugar do "convite"): na tela **Admin → Pessoas**, o Admin cadastra a pessoa (**"Nova pessoa"**: nome, telefone, cargo e **usuário curto**, ex.: `ana.souza`) e toca em **"Cadastrar e gerar senha provisória"**. O app mostra uma **senha aleatória** (ex.: `K7m4-Tq2p`), válida por **24 horas**, que o Admin entrega à pessoa.
- No primeiro login com a senha provisória, o app **obriga a trocar** por uma senha da própria pessoa antes de continuar.
- **Esqueci a senha:** o mesmo caminho. O Admin toca em **"Gerar senha provisória"** na pessoa; a senha antiga para de valer na hora.
- **Senha igual ao usuário não é aceita** (quem soubesse o usuário entraria antes da pessoa e registraria no nome dela).
- O login é pelo **usuário curto**, não pelo telefone (dado pessoal e ruim de digitar).
- **Bloqueio:** depois de **5 senhas erradas seguidas**, o login da pessoa fica bloqueado por 15 minutos.
- **Sessão:** a pessoa fica conectada **até tocar em "Sair"**, desde que use o app pelo menos uma vez a cada **30 dias**. Se um dia houver **tablet compartilhado** na bancada, ele sai sozinho depois de algumas horas sem uso (a definir quando houver o tablet).
- A tela **Nova pessoa** sai **já na primeira versão** do app. Cadastrar e trocar cargo usam funções do banco compartilhadas com o bot (pedido **PB5** no [rumo](rumo-do-app.md)), que precisam estar prontas antes do lançamento.
- O **telefone continua obrigatório** (o bot identifica a pessoa pelo número). Telefone opcional para quem usa só o app e recuperação de senha por **e-mail** ficam nas Ideias.

## Proposta (a confirmar)

- **FastAPI (Python)**, decidido em 15/10, num container novo da stack `~/labflow`. Por quê: Python é mais fácil de ler para quem está aprendendo, gera a documentação da API sozinho (`/docs`) e é forte em dados, Excel, PDF e, no futuro, RAG e laudos automáticos.
- Senha em hash (argon2) e sessão por cookie seguro (o JavaScript da página não consegue ler).
- Permissão conferida na API a cada chamada, pelo cargo lido de `usuarios`, igual ao bot.
- Sem porta pública: acesso por Cloudflare Tunnel ou Tailscale.
- Testes automáticos da API desde o primeiro endpoint.

## Tabelas do login (schema `app`)

| Tabela | Para quê |
|---|---|
| `app.credenciais` | `usuario_id` → usuário curto, hash da senha, trocar no próximo login (sim/não), bloqueado até, tentativas erradas |
| `app.senhas_provisorias` | Hash da senha provisória, validade (24 h), usada em, gerada por |
| `app.sessoes` | Sessões abertas (quem, quando, validade, aparelho) |

## Primeiros endpoints (a revisar depois das perguntas)

- `GET /me` — quem sou e meu cargo
- `GET /minhas-coletas`, `GET /minhas-analises`
- `GET /pendencias-hoje`, `GET /relatorio-do-dia`

## Perguntas a responder

- [x] ~~Como o usuário cria a senha pela primeira vez~~ **Senha provisória gerada pelo Admin** (15/10).
- [x] ~~Recuperação de senha~~ **Nova senha provisória pelo Admin**; e-mail fica para depois (15/10).
- [x] ~~FastAPI ou Node?~~ **FastAPI** (15/10).
- [ ] Cloudflare Tunnel ou Tailscale?
