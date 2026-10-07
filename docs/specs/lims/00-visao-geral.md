---
title: LabFlow LIMS — Visão geral
tags: [labflow, lims, spec]
status: draft
version: v0.1
created: 2026-10-07
---

# Visão geral

**Navegação:** [Índice](index.md) · Próximo: [Contextos e atores](01-contextos-e-atores.md)

## Direção desta edição

O LabFlow deixa de ser só um bot de registro e vira um **LIMS próprio** (Laboratory Information Management System) para o laboratório de microbiologia: rastreável, com limites por especificação, com resultado revisado e liberado por outra pessoa, e com um app web/mobile (PWA) onde cada usuário vê o que registrou. O **WhatsApp continua** como canal de registro rápido; o app é um segundo canal sobre o **mesmo banco e as mesmas regras**.

## O que já existe (base para o LIMS)

- Registro de amostras: coletas de tanque (terra e navio), recebimento de lotes, embarque.
- Prazos e pendências: drops D5/D10/D15, leituras de NFC, TAB, Coliformes, C.T/B.L, Howard, desvio de drop.
- Resultados: C.T/B.L numéricos com alarme fixo (B.L ≥ 50, C.T ≥ 200), TAB/Coliformes positivo/negativo, Howard em %.
- Pessoas: usuários com cargo (Admin, Operador, Consultor), "quem registrou" e "quem leu".
- Banco PostgreSQL com 14 migrations, regras de novo no banco (UNIQUE, CHECK, FK), usuário somente leitura, backup diário.
- Relatório diário no WhatsApp e painel no Power BI.

## O que o LIMS acrescenta

1. **Audit trail:** todo dado alterado guarda o valor antigo, o novo, quem e quando.
2. **Especificações:** limites por análise × item/produto × cliente, no lugar dos limites fixos no código.
3. **Revisão e liberação:** resultado lançado → revisado → liberado, por outra pessoa.
4. **App (PWA) com login:** ver os próprios registros e análises; depois, registrar pelo app.
5. Mais tarde: laudo em PDF, meios e reagentes, equipamentos, QR code, não conformidades.

## Fora do escopo (por ora)

- Substituir o WhatsApp.
- Dado real da empresa no servidor de demonstração (depende da TI e da LGPD).
- Integração com sistemas da empresa (ERP etc.).

## Perguntas a responder

- [ ] Quem é o "cliente" de uma especificação: o cliente final do suco, o destino do embarque, os dois?
- [ ] O LIMS precisa servir para auditoria de acreditação ISO/IEC 17025, ou é inspirado nela?
- [ ] Qual é o primeiro resultado concreto que o laboratório quer ver no app?
- [ ] Indicador de sucesso: o que mostra que o LIMS valeu a pena (tempo de relatório, erros evitados, rastreio)?
