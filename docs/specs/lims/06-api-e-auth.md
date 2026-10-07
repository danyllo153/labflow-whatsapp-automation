---
title: LabFlow LIMS — API e autenticação
tags: [labflow, lims, spec, api, auth]
status: draft
version: v0.1
created: 2026-10-07
---

# API e autenticação

**Navegação:** [Índice](index.md) · Anterior: [Banco e migrations](05-banco-e-migrations.md) · Próximo: [App (PWA)](07-app-pwa.md)

## Direção desta edição

Uma **API própria** fica entre o app e o banco. Começa **só leitura**. O login usa os mesmos usuários e cargos do WhatsApp (tabela `usuarios`), com senha guardada só em hash.

## Proposta inicial

- **FastAPI** (Python, sugerido) num container novo da stack `~/labflow`.
- Senha em hash (argon2 ou bcrypt) + token JWT de curta duração.
- Permissão conferida na API a cada chamada, pelo cargo, igual ao bot.
- Sem porta pública: acesso por Cloudflare Tunnel ou Tailscale.
- Testes automáticos da API desde o primeiro endpoint.

## Primeiros endpoints (só leitura)

- `GET /me` — quem sou e meu cargo
- `GET /minhas-coletas`, `GET /minhas-analises`
- `GET /pendencias-hoje`, `GET /relatorio-do-dia`

## Perguntas a responder

- [ ] FastAPI ou Node?
- [ ] Cloudflare Tunnel ou Tailscale?
- [ ] Como o usuário cria a senha pela primeira vez (link pelo WhatsApp? código?)
- [ ] Recuperação de senha
