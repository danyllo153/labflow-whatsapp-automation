# labflow-whatsapp-automation
Sistema de automação para laboratório de garantia da qualidade, microbiologia e físico-químico . Via WhatsApp — projeto de portfólio para transição de carreira em TI

# LabFlow

Sistema de automação para registro e acompanhamento de amostras de laboratório via WhatsApp, construído com n8n, Google Sheets e IA.

Projeto de portfólio desenvolvido durante minha transição de carreira de Biomedicina/Controle de Qualidade para Tecnologia da Informação.

**Status:** em desenvolvimento (MVP concluído + integração real com WhatsApp via Evolution API funcionando ponta a ponta)

## Stack
n8n · Docker · PostgreSQL · Evolution API · JavaScript · Google Sheets API · Webhooks

## Próximas melhorias
- [ ] Integração com LLM para interpretação de mensagens em linguagem natural
- [ ] Registro de coletas e controle de drops (D5/D10/D15)
- [ ] Suporte a múltiplos tipos de análise


## Documentação

- [Arquitetura do sistema](docs/arquitetura.md) — descrição dos nodes do workflow, decisões técnicas e histórico de incidentes
- [Troubleshooting: integração WhatsApp](docs/troubleshooting.md) — bugs enfrentados na integração com a Evolution API, causa raiz e soluções
