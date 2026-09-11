## Node 1 — Webhook (entrada)

Recebe as mensagens simulando o WhatsApp via HTTP POST. Endpoint de teste: `/webhook-test/labflow-registro`.

## Node 2 — Interpretação (Code node)

Extrai amostra, análise e data da mensagem de texto usando expressões regulares (regex).

Abordagem escolhida: regex em vez de IA nesta primeira versão, para manter o fluxo simples e previsível no MVP. IA entra na V3, para lidar com linguagem mais natural e variável.

Limitação conhecida: só reconhece mensagens em formato relativamente estruturado (ex: "Registrar amostra X, analise Y, data Z"). Mensagens muito diferentes desse padrão não são reconhecidas — resolvido na versão com IA.
