## Node 1 — Webhook (entrada)

Recebe as mensagens simulando o WhatsApp via HTTP POST. Endpoint de teste: `/webhook-test/labflow-registro`.

## Node 2 — Interpretação (Code node)

Extrai amostra, análise e data da mensagem de texto usando expressões regulares (regex).

Abordagem escolhida: regex em vez de IA nesta primeira versão, para manter o fluxo simples e previsível no MVP. IA entra na V3, para lidar com linguagem mais natural e variável.

Limitação conhecida: só reconhece mensagens em formato relativamente estruturado (ex: "Registrar amostra X, analise Y, data Z"). Mensagens muito diferentes desse padrão não são reconhecidas — resolvido na versão com IA.

## Node 3 — Validação (IF)

Verifica se os três campos obrigatórios (amostra, analise, data) foram extraídos com sucesso, usando a condição "is not empty" combinada com AND.

- Se todos os campos estão presentes → segue pela saída True (rumo à gravação no Google Sheets)
- Se algum campo está ausente (null) → segue pela saída False (rumo a uma mensagem de erro para o usuário)

**Testes realizados:**
- Mensagem completa ("Registrar amostra 2458, analise acidofilos, data 09/09/2026") → saiu corretamente pela True Branch
- Mensagem incompleta ("Registrar amostra 3000") → saiu corretamente pela False Branch, com analise e data como null

Isso confirma que o sistema não grava registros incompletos silenciosamente, conforme planejado na seção de segurança e validação do projeto.
