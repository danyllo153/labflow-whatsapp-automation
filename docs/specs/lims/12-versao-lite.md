`# 12 — LabFlow Lite (pasta de rede, sem servidor)
`
`**Pedido:** direção da garantia da qualidade, 28/10/2026; desenho fechado em 01/11.
`**Código:** `app/lite/` (lançador `lite.py`, `LEIA-ME.txt`, `montar.ps1`, `montar-exe.ps1`, `sfx.txt`, teste de fumaça) e `.github/workflows/app-lite.yml`.
`**O projeto atual não muda:** a Lite é o mesmo app (API, telas e migrations) empacotado para Windows.
`
`## Decisões
`- Roda da pasta `X:\LabFlow`, sem Docker, sem admin, sem internet.
`- **Todas as funções do app**; sem senha nem cargos (todas as pessoas têm as mesmas funções).
`- **Sem bot, sem WhatsApp, sem celular e sem assistente** nesta etapa (ideia para depois: assistente dentro do app; acesso por rede só com senha de novo).
`- **Começa vazio:** só as migrations; na primeira abertura a pessoa digita o nome (sem senha; ver "Sem senha" abaixo).
`- **Um PC por vez, só em 127.0.0.1:** o PC que abre primeiro liga o PostgreSQL e o app nele mesmo e grava o aviso de servidor; outro PC que tente abrir recebe o aviso de qual PC está com o LabFlow aberto ("use Encerrar lá") e não se conecta. Nada escuta na rede (sem porta 8000 aberta para outros PCs, sem regra de firewall).
`
`## Sem senha, sem Admin e sem celular (27/11)
`- **Entrar:** a tela mostra a lista de nomes e "Sou novo aqui". Não há senha, senha provisória, "Redefinir senha do Admin" nem cargos: todas as pessoas têm as mesmas funções (a API trata o cargo do banco como Admin só no modo Lite, `LABFLOW_LITE=1`). Em Pessoas dá para cadastrar um nome e bloquear/liberar o acesso; quem é bloqueado perde a sessão na hora.
`- **O "Admin" some:** na primeira abertura quem digita o nome assume o registro que era o Admin (mesmo id; migration 088). Em instalação antiga, as pessoas que já existiam aparecem na lista. Nome com mais de 40 letras gravado antes da 087 continua na lista, para editar.
`- **Rastro:** cada lançamento grava quem fez; a sessão guarda o nome do PC (`app.sessoes.aparelho`).
`- **Limite aceito:** sem senha, quem senta no PC escolhe qualquer nome; o rastro é o nome escolhido e o PC. Só é aceitável porque a Lite escuta **só em 127.0.0.1** (um PC por vez). **Voltar a atender outros PCs = veto da segurança até haver senha de novo.**
`- **Sem celular:** sem manifest nem service worker (o que uma versão antiga deixou no navegador é desligado), sem barra de baixo nem gaveta; a tela é para PC (a partir de ~1280 px). A Completa continua com o celular.
`- **Quem vai no laudo:** em cada folha em preenchimento, "Quem vai no laudo" escolhe os nomes (086); sem ninguém marcado o campo sai em branco (a assinatura é à mão). **Equipe do turno:** quem está no turno coloca os colegas nele e tira quem entrou por engano.
`- **Encerrar:** grava a cópia no X:, **confere que ela vale** e só então libera o outro PC; se não conferiu, o aviso de servidor fica e o PC avisa.
`
`## Instalar e atualizar com um arquivo (28/11)
`Pedido: "clicar só em Abrir LabFlow e já abrir, como um programa instalado, sem tela preta e sem burocracia".
`- **Na pasta de rede ficam só `Abrir LabFlow.exe` e `dados\`.** O `.exe` é um autoextraível (SFX) do WinRAR com o programa inteiro (~1 arquivo, lido em sequência; o PostgreSQL não roda de pasta de rede, então o programa é extraído no PC).
`- **Primeira vez em um PC (dois cliques no `.exe`):** extrai (alguns segundos, sem janela: o SFX roda com `Silent=1`, que no teste não mostrou progresso; o aviso "Preparando o LabFlow..." aparece ao terminar) em `%LOCALAPPDATA%\LabFlowLite\p-<hash>`; o `lite.py` (rodado com `pythonw`, sem console) grava `instalado.json`, cria o atalho **LabFlow** na área de trabalho do usuário (com o ícone) e abre o LabFlow.
`- **Depois:** abre-se pelo atalho (`pythonw lite.py --raiz <pasta de rede> --oculto`), sem copiar nada. Ao abrir, o `lite.py` compara tamanho e data do `.exe` da rede com os guardados em `instalado.json`; se mudaram (e o LabFlow não está aberto neste PC), roda o `.exe` novo, que mostra o aviso "Atualizando LabFlow...", instala em `programa-<versão nova>`, recria o atalho, apaga as pastas de programa velhas (só as que não estão em uso: a pasta é renomeada antes, e o Windows recusa se houver arquivo aberto) e abre. Rede fora do ar: abre o que já está instalado.
`- **Atualizar = trocar UM arquivo** (o `.exe` novo por cima do antigo na pasta de rede), com o LabFlow encerrado em todos os PCs.
`- **Sem administrador (decisão de 27/11):** o `.exe` roda como o usuário (módulo `Default.SFX`, manifesto `asInvoker`); só escreve em `%LOCALAPPDATA%` e na área de trabalho do usuário; nada de Program Files, registro, serviço ou firewall; sem `.bat`, `.vbs` nem `-ExecutionPolicy Bypass` no que o laboratório clica (o `PowerShell` escondido que cria o `.lnk` roda um comando, não um script). `dados\` nunca entra no `.exe` nem é tocada: o `Presetup` só apaga a pasta **desta versão** quando a extração anterior ficou pela metade (sem `pronto.txt`).
`- **Banco ao atualizar:** se a nova versão traz migrations, o `lite.py` grava antes `dadosackupntes-de-atualizar-<data>.dump` (já existia; só confirmado) e só então aplica.
`- **Gerar:** `montar.ps1` monta a pasta `LabFlow\instalacao`; `montar-exe.ps1 -Pacote <pasta LabFlow>` (precisa do WinRAR só no PC que gera) cria `Abrir LabFlow.exe` dentro dela. O `.exe` e o ícone (gerado na montagem) não vão para o Git.
`- **Limite conhecido:** na primeira instalação, nos segundos da extração (até ~20 s com o antivírus lendo os arquivos) não há janela; só o cursor ocupado. Melhorar isso = o lançador do plano B, com barra de progresso.
- **Permissão da pasta de rede:** só quem administra grava em `Abrir LabFlow.exe` e na pasta do LabFlow; quem grava ali pode trocar o programa que os PCs rodam. Os usuários precisam de leitura no `.exe` e escrita só em `dados\`.
- **Caminho curto:** a pasta é `p-<7 caracteres do SHA-256 da versão>` porque o Windows limita ~260 caracteres por caminho (com um `%LOCALAPPDATA%` de 108 caracteres a DLL do libpq passava de 250 e não abria). Ao instalar, o `lite.py` mede o arquivo mais comprido; se passar de 240, mostra uma janela em português pedindo à TI para encurtar o perfil, em vez de falhar calado.
- **Plano B** se o antivírus ou a política da empresa bloquear o `.exe` novo: lançador pequeno em C# compilado com o `csc.exe` que já vem no Windows, com o programa num `.zip` (mesmo ganho, mais código).
`
`### Texto de 1 página para o laboratório (vai no `LEIA-ME.txt` do pacote)
`**Instalar (uma vez por PC):** (1) copie `Abrir LabFlow.exe` para a pasta de rede, por exemplo `X:\LabFlow`, ao lado de `dados\`; (2) em cada PC, dois cliques no `.exe`; (3) espere alguns segundos: o LabFlow abre e o atalho "LabFlow" aparece na área de trabalho. Daí em diante, abra pelo atalho.
`**Atualizar:** (1) "Encerrar o LabFlow" em todos os PCs (ícone perto do relógio); (2) copie o `.exe` novo por cima do antigo em `X:\LabFlow`; (3) abra o atalho "LabFlow": ele avisa "Atualizando LabFlow...", atualiza e abre. Nunca apague nem substitua a pasta `dados`.
`**Trocar de PC:** "Encerrar o LabFlow" no PC atual e só então abrir no outro.
`
`## Pastas
````
`LabFlow\                      (X:, exemplo)
`  Abrir LabFlow.exe           o programa inteiro (trocar este arquivo = atualizar)
`  LEIA-ME.txt
`  dados\                      nunca apagar nem substituir
`    labflow.dump  labflow.anterior.dump  labflow.info.json  servidor.json  backup\  recuperacao\  marca%LOCALAPPDATA%\LabFlowLite\   em cada PC
`  p-<hash>\ (python\ embutido + dependências, app\labflow_api\, web\, migrations\, postgres\ 17.12, lite\lite.py, VERSAO.txt)
`  data\ (PostgreSQL do servidor)  instalado.json  estado.json  lite.log  api.log
`área de trabalho do usuário: atalho "LabFlow"
````
`
`## Como funciona
`1. O `.exe` extrai o programa no PC (o PostgreSQL não roda bem de pasta de rede); o `lite.py` troca o atalho e limpa as versões velhas.
`2. `servidor.json` no X: diz quem é o servidor; ele renova a data a cada 10 s (hora medida pelo próprio servidor de arquivos). Sem sinal há 45 s, o próximo que abrir assume.
`3. Banco: se o `data\` local está em dia com o X: (mesmo `gravado_em`), religa (recupera uma queda sem perder nada); senão restaura o `labflow.dump`. Banco local que ficou para trás depois de uma queda vai para `dados\recuperacao`.
`4. Migrations: aplica as que faltam (tabela `public.lite_migracoes`), com backup antes quando não é o banco novo.
`5. Cópia no X: a cada 60 s se houve escrita (e a cada 10 min mesmo sem), e ao fechar; `labflow.anterior.dump` e backup do dia (30 dias).
`6. Papéis como no servidor (`labflow_app`, `labflow_leitura`, `labflow_app_web`); o app entra como `labflow_app_web`; PostgreSQL só em 127.0.0.1 (o app entra com a senha do papel, guardada só no PC).
`7. Fechar: "Encerrar o LabFlow" no ícone perto do relógio (ou ENTER + S na janela, nos testes), ou o X da janela (o Windows dá poucos segundos; o que não couber fica no banco local e volta na próxima abertura no mesmo PC).
`
`## Janela e ícone (01/11)
`- O LabFlow abre como programa: modo aplicativo do Edge (`--app --start-fullscreen`: tela cheia como o F11, sem barra de endereço; o F11 volta para janela), senão o do Chrome, senão o navegador padrão.
`- Sempre sem janela preta: o atalho e o `.exe` rodam `pythonw --oculto`.
`- Oculto: ícone perto do relógio (pystray) com Abrir o LabFlow, Endereço neste PC e Encerrar (com confirmação); avisos (não abriu, outro PC assumiu, falha ao gravar no X:, cópia não conferida) em janelinha do Windows. Sem o ícone (sessão sem área de trabalho), segue funcionando.
`- Não há senha para mostrar nem anotar: o `lite.log` não guarda nenhum segredo.
`
`## Marca da instalação
`- Pasta `dados\marca` no X: (criada na primeira abertura, com um LEIA-ME): `marca.json` (`nome`, `cor_principal`, `cor_secundaria`, em `#rrggbb`), `logo.png` (até 2 MB) e `estilo.css` (até 200 KB, por último). Tudo opcional; arquivo com erro é ignorado sozinho.
`- Ao abrir, a Lite copia a pasta para o PC e passa `LABFLOW_MARCA_DIR` ao app; a API (`marca.py`, rotas `/marca`, `/marca/logo.png`, `/marca/estilo.css`, sem login) lê uma vez. Mudou a marca: reabrir no PC servidor.
`- Cor principal: botões, links e abas; secundária: menu e topo (tons derivados nos temas claro e escuro). Logo no menu e na tela de entrar; o nome também no título da aba.
`- **Laudos não mudam:** já saem nos modelos da empresa.
`- Fica em `dados`, então a troca da `instalacao` não mexe nela. **Nada da marca vai para o repositório** (só valores fictícios nos testes; `.gitignore` barra `dados/` e `marca/`). Sem a variável (servidor de demonstração), fica o LabFlow.
`
`## O que derruba o servidor (vai no LEIA-ME)
`Sair do usuário do Windows, suspender/hibernar, reinício do Windows Update. Troca de turno é só "Trocar de pessoa" no LabFlow.
`
`## Para a TI
`Nenhuma liberação de porta ou firewall: o LabFlow escuta só em `127.0.0.1` (neste PC) e roda sem administrador (o `.exe` instala só na pasta do usuário). Se o antivírus bloquear o `.exe`, liberar "Abrir LabFlow.exe". Um PC por vez; a pasta de rede guarda só os dados.
`
`## Como gerar o pacote
`GitHub Actions → "LabFlow Lite (pacote Windows)" (roda em PR de `app/lite/**`, em push na `main` e manual) → baixar `LabFlow-Lite` em Artifacts → descompactar → `montar-exe.ps1` (WinRAR) gera o `Abrir LabFlow.exe` → copiar o `.exe` para o X:. O mesmo job testa no Windows: abrir do zero sem senha, o outro PC ver o aviso de que já está aberto (sem conectar), encerrar com a cópia conferida e restaurar em outro PC.
`
`## Pendências
`- Testar nos PCs do laboratório (Windows 10, rede da empresa), sem precisar liberar porta.
`- Limites reais (`limites_nfc`, Howard): carregar pelo app ou por arquivo fora do Git depois do primeiro acesso.
