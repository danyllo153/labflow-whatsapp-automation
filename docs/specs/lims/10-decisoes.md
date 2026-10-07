---
title: LabFlow LIMS — Decisões
tags: [labflow, lims, spec, decisoes]
status: draft
version: v0.1
created: 2026-10-07
---

# Decisões

**Navegação:** [Índice](index.md) · Anterior: [Pontos de atenção](09-pontos-de-atencao.md) · Próximo: [Guia prático](guia-pratico.md)

## Direção desta edição

Uma linha por decisão, mais recente no topo, com o porquê. O que está aqui não se rediscute sem motivo novo. O que ainda não foi decidido fica nas "Perguntas a responder" de cada documento.

## Decidido

- **2026-10-07** Destino do projeto: **LIMS próprio** com app web/mobile (PWA), login e IA embutida; o **WhatsApp continua** como canal. Ordem: Fase 0 (v1.2.0) → base de LIMS no banco → API → PWA só leitura → escrita pelo app → IA avançada → extras.
- **2026-10-07** O LIMS é planejado por **Spec-Driven Development**: estes documentos primeiro (`v0.x`), tarefas e código só depois de aprovados (`v1.0`).
- **2026-10-07** O app escreve pelo **mesmo pipeline** do WhatsApp (regex → IA → "sim"), para não duplicar regras.
- **Herdado do LabFlow:** permissão no código, nunca no prompt (Bug 23); a IA sugere e o código decide; dados fictícios (LGPD); o banco confere as regras de novo; mudança grande sempre reversível.

## Em aberto (resumo)

- Adiantar o áudio para logo depois da v1.2.0?
- Revisor: cargo novo ou papel do Admin?
- FastAPI ou Node; Cloudflare Tunnel ou Tailscale.
- Limites oficiais do Howard e do NFC.
