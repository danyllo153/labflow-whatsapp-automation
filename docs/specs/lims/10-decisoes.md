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

- **2026-10-15** (app) **Excluir não apaga:** o registro fica guardado como excluído (quem, quando, motivo), some das páginas e das contas, e o Admin pode ver e recuperar. Por quê: ISO 17025 (o dado original não se perde) e recuperação de engano; é o "invalidar" do doc 04.

- **2026-10-15** (app) **O app é o LIMS** ("cara" do sistema, como o Power BI hoje) e o bot vira **assistente de IA** dentro dele. **Gravação por funções do banco** (opção A): editar e excluir viram funções no PostgreSQL, criadas com a sessão do bot e usadas pelo app (clique, assistente, foto) e pelo bot; o app lê por views. Por quê: a regra mora num lugar só, app e bot nunca discordam, e combina com o histórico do LIMS feito no banco. Complementa a decisão de 07/10 ("mesmo pipeline"): o assistente continua usando o pipeline do bot; as telas usam as funções.

- **2026-10-15** (app) **Permissões por cargo:** Operador = analista em geral (registra, corrige com motivo, entra no turno e edita o próprio horário, encerra o turno); **excluir: Admin e Operador, com motivo e confirmação** (mudado na noite de 15/10; o Coletor pede ao Admin); adicionar pessoa e trocar cargo só o Admin; Consultor só lê; cargo futuro **Coletor** só registra coletas (pedido PB2 ao bot). Por quê: o Operador é quem conhece o registro errado; o motivo e o histórico mantêm o rastreio. O atraso de entrada precisa ser registrado por quem chegou.

- **2026-10-15** (app) **WhatsApp continua no ar** enquanto o piloto está em teste; o app tende a ser o canal principal e desligar o WhatsApp é decisão futura (Fase E do [rumo do app](rumo-do-app.md)). Por quê: o piloto está no ar com 5 Operadores, e o chat do app usa o mesmo pipeline, então os dois convivem sem duplicar regras.
- **2026-10-15** (app) O app **começa lendo as tabelas atuais** do bot, sempre por **views**, sem esperar as migrations 021–026. Por quê: painel, relatório do turno e gráficos já têm os dados; ler por view isola o app da mudança da 024.
- **2026-10-15** (app) **Relatório por turno de revezamento** (Manhã 08–16, Tarde 16–00, Madrugada 00–08, 7 dias, horários editáveis pelo Admin); escala fixa do ADM não vira turno; **cada pessoa entra no turno pelo app** (horário editável) e o que ela registra fica ligado a esse turno; página do relatório compartilhada; o turno se encerra quando **a última pessoa sai** (ou sozinho quando o próximo começa) e as pendências passam para o próximo; encerrado = só leitura, o Admin reabre com motivo; toda leitura e registro precisa de **hora** (pedido PB1 à sessão do bot). Por quê: na troca de turno as pessoas se cruzam e o automático daria conflito.
- **2026-10-15** (app) **Esterilização registrada à mão** por botões (Ponteira, Meio, Frasco, Descarte) **com o número do ciclo** numa tabela do app, sem resultado da fita (sai da nota da autoclave); a anotação no Word continua como rastreio oficial; é sob demanda, então "esterilizações pendentes" é campo escrito à mão. Por quê: a autoclave não exporta dados; hoje o registro é feito olhando a fita e anotando no Word.
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
