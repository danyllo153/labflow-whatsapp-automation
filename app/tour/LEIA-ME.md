# Vídeos do LabFlow (tour guiado com voz de IA)

Grava os vídeos de explicação do LabFlow no estilo "tour guiado": a parte da tela que importa ganha moldura laranja,
o resto escurece, a legenda aparece embaixo e uma voz de IA (pt-BR) lê cada legenda. **Só dados fictícios** (o banco
de teste com `db/seeds`); os vídeos **nunca** vão para o repositório.

**Um vídeo por grupo do app** (01/11), de 2 a 4 minutos, mais o tour geral:

| Arquivo | Vídeo | O que mostra |
|---|---|---|
| `01-inicio` | Início e Turno | entrar, Início e as abas dele, Turno, estufas, relatório do turno, busca e tema |
| `02-nfc` | NFC | Tanques terra (todas as abas: Painel, Análise, Resultados, Laudo, IT, Vídeo), Tanques navio, Recebimento NFC |
| `03-fcoj` | FCOJ (concentrado) | Recebimento FCOJ e Embarque FCOJ (registrar, compostas, resultados, laudos) |
| `04-tab-coliformes-howard` | TAB, Coliformes e Howard | para fazer, iniciar análise, no caldo e incubados, resultados, laudos |
| `05-drops-desvios` | Drops e Desvios | concluir em lote, desvios de drop, não ok, em repetição |
| `06-aguas-superficies` | Águas e superfícies | água do processo, água de consumo (pontos e limites), CIP baia e linha |
| `07-registros-diarios` | Registros diários | esterilização, material asséptico, meios e lotes, branco do dia, incubação |
| `08-leituras-coletas-arquivo` | Leituras, Coletas e Arquivo | relatório do dia, leituras por análise, coletas, contra-amostras |
| `09-administracao` | Administração | pessoas, turnos e estufas, coletas excluídas, IT e vídeo de cada app |
| `00-geral` | Tour geral | tudo de ponta a ponta (apresentação) |

- `roteiros/<vídeo>.mjs`: os passos de cada vídeo (tela, aba, destaque, legenda e a `fala`, quando a escrita não soa bem
  lida, como C.T, B.L, pH e IT). Mudou uma tela do app, ajuste aqui. `roteiros/index.mjs` lista os vídeos e põe a capa e o fim.
- `comum.mjs`: a usuária do tour, os seletores (cartão, aba do app), a capa e o `demoResultados`, que mostra a aba
  Resultados **funcionando**: busca digitada, Filtros escolhidos e as etiquetas, fábricas comparadas, as visões do gráfico
  (e o toque numa coluna), **Exportar Excel** (aparece o aviso do arquivo baixado), Imprimir, Limpar filtros e a página
  do load ou do navio. Também há o **Importar CSV** do histórico de meios (com um CSV fictício) e o Excel das leituras do dia.
- `gravar.mjs --tour <vídeo>`: abre o app no Chromium (Playwright), mostra cada passo e grava `tour.webm` +
  `linha-do-tempo.json`. Os vídeos que não mostram a tela de entrar já começam logados. Clique que não acha o botão não
  derruba o vídeo: segue sem ele e deixa a foto `aviso-clique-*.png` para corrigir o roteiro.
- `narrar.py`: gera a fala de cada passo com o edge-tts (voz `pt-BR-FranciscaNeural`) e as durações.
- `montar.py`: põe cada fala no seu momento e gera o MP4.
- `preparar.py`: cria a usuária fictícia do tour (Marina Lopes, Admin) no banco de teste.

**Gerar os vídeos:** GitHub → Actions → "Vídeo do tour (LabFlow)" → Run workflow → escolher **todos** ou um vídeo
(um push em `app/tour/**` gera todos) → baixar `LabFlow-01-inicio`, `LabFlow-02-nfc`... em Artifacts (ficam 30 dias).
Cada vídeo roda num job próprio, em paralelo. A voz precisa de internet, por isso roda no GitHub.

**Pôr no app:** subir o MP4 (YouTube não listado ou Google Drive com link) e, como Admin, colar o link na aba **Vídeo**
de cada app do grupo.
