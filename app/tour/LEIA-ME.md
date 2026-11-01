# Tour guiado do LabFlow (vídeo de apresentação)

Grava um vídeo das ferramentas do LabFlow no estilo "tour guiado": a parte da tela que importa ganha moldura laranja,
o resto escurece, a legenda aparece embaixo e uma voz de IA (pt-BR) lê cada legenda. **Só dados fictícios** (o banco
de teste com `db/seeds`); o vídeo **nunca** vai para o repositório.

- `roteiro.mjs`: os passos (tela, destaque, legenda e a `fala`, quando a escrita não soa bem lida). Mudou o app, ajuste aqui.
- `gravar.mjs`: abre o app no Chromium (Playwright), mostra cada passo e grava `tour.webm` + `linha-do-tempo.json`.
- `narrar.py`: gera a fala de cada passo com o edge-tts (voz `pt-BR-FranciscaNeural`) e as durações.
- `montar.py`: põe cada fala no seu momento e gera o `tour.mp4`.
- `preparar.py`: cria a usuária fictícia do tour (Marina Lopes, Admin) no banco de teste.

**Gerar o vídeo:** GitHub → Actions → "Vídeo do tour (LabFlow)" → Run workflow (ou um push em `app/tour/**`) →
baixar `LabFlow-tour` em Artifacts. A voz precisa de internet, por isso roda no GitHub.
