---
title: LabFlow LIMS — Fluxos
tags: [labflow, lims, spec, fluxos]
status: draft
version: v0.1
created: 2026-10-07
---

# Fluxos

**Navegação:** [Índice](index.md) · Anterior: [App (PWA)](07-app-pwa.md) · Próximo: [Pontos de atenção](09-pontos-de-atencao.md)

## Direção desta edição

Cada ação do LIMS tem um caminho único, do canal (WhatsApp ou app) até o banco, passando pelo mesmo lugar onde as regras são conferidas. Os fluxos são escritos aqui antes de qualquer código.

## Fluxos a descrever

- [ ] **Lançar resultado** (WhatsApp hoje → com estado `lancado`)
- [ ] **Revisar e liberar** (fila → revisor → liberado/recusado)
- [ ] **Corrigir resultado** (motivo obrigatório → audit trail)
- [ ] **Cadastrar especificação** (gestor → aprovação → vigência)
- [ ] **Login no app** (primeiro acesso, senha, token)
- [ ] **Consultar "minhas análises"** (app → API → banco)

## Modelo de cada fluxo

```
Gatilho: quem faz o quê, por qual canal
Pré-condições: o que precisa existir e qual cargo
Passos: 1, 2, 3...
Regras conferidas: no código / no banco
Resultado: o que muda no banco e o que o usuário vê
Erros: o que acontece quando algo falha
```
