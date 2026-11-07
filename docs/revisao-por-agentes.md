# Revisão por agentes com contexto zerado (modelo para qualquer projeto)

Origem da ideia: o repositório `google/elephant-goldfish-model` (EGM). Quem escreve o código tem as suposições dele e não as enxerga; um agente novo, que só recebe o diff e as regras, enxerga. **Não substitui testes, CI nem o olhar humano.**

No LabFlow isso é a skill `/revisar-pr` (`.claude/skills/revisar-pr/SKILL.md`). Para um projeto novo (por exemplo o da imobiliária, com front e back), copie a estrutura e troque só o conteúdo das regras.

## Como criar a skill num projeto novo

1. Copie `.claude/skills/revisar-pr/SKILL.md` para o projeto novo e troque o nome (`revisar-pr` serve) e a descrição.
2. Escreva as regras do projeto no `CLAUDE.md` dele (as skills de revisão leem de lá). Sem regra escrita, o revisor só acha o genérico.
3. Monte a tabela de revisores a partir deste modelo e **apague o que não existe no projeto**.

## Revisores-base (quase todo projeto precisa)

| Revisor | Pergunta que ele responde | Onde mora |
|---|---|---|
| **Segurança e dados pessoais** (sempre) | Vazou segredo, dado real ou ID? Falta checagem de permissão? Há injeção (SQL, XSS)? | todo diff |
| **Regras de negócio** | O texto e o comportamento seguem o vocabulário e as regras do domínio? | `CLAUDE.md` do projeto |
| **Back-end** | Validação, autenticação por rota, transação, erro que vaza detalhe, teste da rota nova | pasta da API |
| **Front-end** | Estado e efeitos, carregando/erro/vazio, formulário, acessibilidade, celular, contrato com a API | pasta da web |
| **Contrato back x front** | Mudou campo em um lado e não no outro? | os dois |
| **Banco e migrations** | Numeração, desfazer, backup, dado apagado sem trava | pasta de migrations |

## Para uma imobiliária (exemplos de regras de negócio)

Troque os itens do LabFlow por regras do domínio, por exemplo: dados de cliente e documentos (CPF, RG, contrato) sempre fictícios no repositório e nos testes; valores em reais com duas casas e arredondamento definido; datas de contrato e reajuste (IGP-M, IPCA) calculadas por regra única; status do imóvel (disponível, reservado, alugado, vendido) só muda por transição permitida; foto e anúncio sem endereço completo de quem não autorizou; consentimento (LGPD) registrado antes de guardar contato.

## Regras de ouro

- Subagente novo por revisor, **todos em paralelo**, só leitura, sem histórico da conversa e sem dizer "o que já foi testado".
- Sempre conferir cada achado no código antes de repassar; descartar o que não se confirma.
- Só relata; o humano escolhe o que corrigir.
- Rodar antes do "pode mesclar", depois do CI.
