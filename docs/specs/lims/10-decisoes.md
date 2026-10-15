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

- **2026-10-15** (app) **WhatsApp continua no ar** enquanto o piloto está em teste; o app tende a ser o canal principal e desligar o WhatsApp é decisão futura (Fase E do [rumo do app](rumo-do-app.md)). Por quê: o piloto está no ar com 5 Operadores, e o chat do app usa o mesmo pipeline, então os dois convivem sem duplicar regras.
- **2026-10-15** (app) O app **começa lendo as tabelas atuais** do bot, sempre por **views**, sem esperar as migrations 021–026. Por quê: painel, relatório do turno e gráficos já têm os dados; ler por view isola o app da mudança da 024.
- **2026-10-15** (app) **Relatório por turno de revezamento** (Manhã 08–16, Tarde 16–00, Madrugada 00–08, 7 dias, horários editáveis pelo Admin); escala fixa do ADM não vira turno; **analistas do turno marcados à mão**; registro entra pelo turno, não pela hora. Por quê: na troca de turno as pessoas se cruzam e o automático daria conflito.
- **2026-10-15** (app) **Esterilização registrada à mão** por botões (Ponteira, Meio, Frasco, Descarte) numa tabela do app. Por quê: a autoclave não exporta dados; hoje o registro é feito olhando a fita e anotando no Word.
- **2026-10-15** (app) **Visual claro** (creme e laranja claro) no estilo dos LIMS comerciais, para celular, tablet e computador, **sem marca da empresa** no repositório; **só online**; **sem notificação** e **sem loja** por enquanto.

- **2026-10-07** Destino do projeto: **LIMS próprio** com app web/mobile (PWA), login e IA embutida; o **WhatsApp continua** como canal. Ordem: Fase 0 (v1.2.0) → base de LIMS no banco → API → PWA só leitura → escrita pelo app → IA avançada → extras.
- **2026-10-07** O LIMS é planejado por **Spec-Driven Development**: estes documentos primeiro (`v0.x`), tarefas e código só depois de aprovados (`v1.0`).
- **2026-10-07** O app escreve pelo **mesmo pipeline** do WhatsApp (regex → IA → "sim"), para não duplicar regras.
- **Herdado do LabFlow:** permissão no código, nunca no prompt (Bug 23); a IA sugere e o código decide; dados fictícios (LGPD); o banco confere as regras de novo; mudança grande sempre reversível.

## Em aberto (resumo)

- Adiantar o áudio para logo depois da v1.2.0?
- Revisor: cargo novo ou papel do Admin?
- FastAPI ou Node; Cloudflare Tunnel ou Tailscale.
- Limites oficiais do Howard e do NFC.
