# labflow-whatsapp-automation
Sistema de automação para laboratório de garantia da qualidade, microbiologia e físico-químico . Via WhatsApp — projeto de portfólio para transição de carreira em TI

# LabFlow

Sistema de automação para registro e acompanhamento de amostras de laboratório via WhatsApp, construído com n8n, Google Sheets e IA.

Projeto de portfólio desenvolvido durante minha transição de carreira de Biomedicina/Controle de Qualidade para Tecnologia da Informação.

**Status:** em desenvolvimento (MVP concluído + integração real com WhatsApp via
Evolution API funcionando ponta a ponta, incluindo registro de amostras,
coleta de terra, coleta de navio multi-tanque e consulta de drops do dia)


## Stack
n8n · Docker · PostgreSQL · Evolution API · JavaScript · Google Sheets API · Webhooks

## Funcionalidades

- Registro de amostra via WhatsApp (parsing por regex + validação + gravação em planilha)
- Registro de coleta de terra (1 tanque por mensagem) com geração automática de 3 pontos de reanálise (drops D5/D10/D15)
- Registro de coleta de navio (1 a 16 tanques numa única mensagem) com o mesmo controle de drops
- Consulta de drops pendentes do dia via WhatsApp ("drops hoje"), agrupando terra e navio automaticamente
- 

## Próximas melhorias

- [ ] Integração com LLM para interpretação de mensagens em linguagem natural
- [ ] Suporte a múltiplos tipos de análise (normal / estresse)
- [ ] Marcar status de drop como "Concluído" via WhatsApp após a análise ser feita
- [ ] Validação de campos obrigatórios nos branches de coleta (hoje só o branch de amostra valida antes de responder)

## Documentação

- [Arquitetura do sistema](docs/arquitetura.md) — descrição dos nodes do workflow, decisões técnicas e histórico de incidentes
- [Troubleshooting: integração WhatsApp](docs/troubleshooting.md) — bugs enfrentados na integração com a Evolution API, causa raiz e soluções
