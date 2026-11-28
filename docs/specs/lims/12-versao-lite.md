# 12 — LabFlow Lite (pasta de rede, sem servidor)

**Pedido:** direção da garantia da qualidade, 28/10/2026; desenho fechado em 01/11.
**Código:** `app/lite/` (lançador, `.bat`, `LEIA-ME.txt`, `montar.ps1`, teste de fumaça) e `.github/workflows/app-lite.yml`.
**O projeto atual não muda:** a Lite é o mesmo app (API, telas e migrations) empacotado para Windows.

## Decisões
- Roda da pasta `X:\LabFlow`, sem Docker, sem admin, sem internet.
- **Todas as funções do app**; sem senha nem cargos (todas as pessoas têm as mesmas funções).
- **Sem bot, sem WhatsApp, sem celular e sem assistente** nesta etapa (ideia para depois: assistente dentro do app; acesso por rede só com senha de novo).
- **Começa vazio:** só as migrations; na primeira abertura a pessoa digita o nome (sem senha; ver "Sem senha" abaixo).
- **Um PC por vez, só em 127.0.0.1:** o PC que abre primeiro liga o PostgreSQL e o app nele mesmo e grava o aviso de servidor; outro PC que tente abrir recebe o aviso de qual PC está com o LabFlow aberto ("use Encerrar lá") e não se conecta. Nada escuta na rede (sem porta 8000 aberta para outros PCs, sem regra de firewall).

## Sem senha, sem Admin e sem celular (27/11)
- **Entrar:** a tela mostra a lista de nomes e "Sou novo aqui". Não há senha, senha provisória, "Redefinir senha do Admin" nem cargos: todas as pessoas têm as mesmas funções (a API trata o cargo do banco como Admin só no modo Lite, `LABFLOW_LITE=1`). Em Pessoas dá para cadastrar um nome e bloquear/liberar o acesso; quem é bloqueado perde a sessão na hora.
- **O "Admin" some:** na primeira abertura quem digita o nome assume o registro que era o Admin (mesmo id; migration 088). Em instalação antiga, as pessoas que já existiam aparecem na lista. Nome com mais de 40 letras gravado antes da 087 continua na lista, para editar.
- **Rastro:** cada lançamento grava quem fez; a sessão guarda o nome do PC (`app.sessoes.aparelho`).
- **Limite aceito:** sem senha, quem senta no PC escolhe qualquer nome; o rastro é o nome escolhido e o PC. Só é aceitável porque a Lite escuta **só em 127.0.0.1** (um PC por vez). **Voltar a atender outros PCs = veto da segurança até haver senha de novo.**
- **Sem celular:** sem manifest nem service worker (o que uma versão antiga deixou no navegador é desligado), sem barra de baixo nem gaveta; a tela é para PC (a partir de ~1280 px). A Completa continua com o celular.
- **Quem vai no laudo:** em cada folha em preenchimento, "Quem vai no laudo" escolhe os nomes (086); sem ninguém marcado o campo sai em branco (a assinatura é à mão). **Equipe do turno:** quem está no turno coloca os colegas nele e tira quem entrou por engano.
- **Encerrar:** grava a cópia no X:, **confere que ela vale** e só então libera o outro PC; se não conferiu, o aviso de servidor fica e o PC avisa.

## Pastas
```
LabFlow\                      (X:)
  Abrir LabFlow.vbs (sem janela)  Abrir LabFlow com janela.bat  Fechar LabFlow.bat  LEIA-ME.txt  COMECE AQUI.html
  instalacao\                 trocada inteira a cada versão
    python\ (embutido + dependências)  app\labflow_api\  web\  migrations\  postgres\ (17.12)  lite\lite.py  VERSAO.txt
  dados\                      nunca apagar nem substituir
    labflow.dump  labflow.anterior.dump  labflow.info.json  servidor.json  backup\  recuperacao\
%LOCALAPPDATA%\LabFlowLite\   em cada PC
  programa\ (cópia da instalacao)  data\ (PostgreSQL do servidor)  estado.json  lite.log  api.log
```

## Como funciona
1. O `.bat` copia a `instalacao` para o PC quando a versão muda (o PostgreSQL não roda bem de pasta de rede).
2. `servidor.json` no X: diz quem é o servidor; ele renova a data a cada 10 s (hora medida pelo próprio servidor de arquivos). Sem sinal há 45 s, o próximo que abrir assume.
3. Banco: se o `data\` local está em dia com o X: (mesmo `gravado_em`), religa (recupera uma queda sem perder nada); senão restaura o `labflow.dump`. Banco local que ficou para trás depois de uma queda vai para `dados\recuperacao`.
4. Migrations: aplica as que faltam (tabela `public.lite_migracoes`), com backup antes quando não é o banco novo.
5. Cópia no X: a cada 60 s se houve escrita (e a cada 10 min mesmo sem), e ao fechar; `labflow.anterior.dump` e backup do dia (30 dias).
6. Papéis como no servidor (`labflow_app`, `labflow_leitura`, `labflow_app_web`); o app entra como `labflow_app_web`; PostgreSQL só em 127.0.0.1 (o app entra com a senha do papel, guardada só no PC).
7. Fechar: ENTER + S na janela, `Fechar LabFlow.bat`, ou o X da janela (o Windows dá poucos segundos; o que não couber fica no banco local e volta na próxima abertura no mesmo PC).

## Janela e ícone (01/11)
- O LabFlow abre como programa: modo aplicativo do Edge (`--app --start-fullscreen`: tela cheia como o F11, sem barra de endereço; o F11 volta para janela), senão o do Chrome, senão o navegador padrão.
- Primeira vez em cada PC: a janela preta (preparo). Depois (marcador `%LOCALAPPDATA%\LabFlowLite\ja-abriu.txt`, sem opções extras no .bat): `pythonw --oculto`, sem janela.
- Oculto: ícone perto do relógio (pystray) com Abrir o LabFlow, Endereço neste PC e Encerrar (com confirmação); avisos (não abriu, outro PC assumiu, falha ao gravar no X:, cópia não conferida) em janelinha do Windows. Sem o ícone (sessão sem área de trabalho), segue funcionando e fecha pelo `Fechar LabFlow.bat`.
- Não há senha para mostrar nem anotar: o `lite.log` não guarda nenhum segredo.

## Marca da instalação
- Pasta `dados\marca` no X: (criada na primeira abertura, com um LEIA-ME): `marca.json` (`nome`, `cor_principal`, `cor_secundaria`, em `#rrggbb`), `logo.png` (até 2 MB) e `estilo.css` (até 200 KB, por último). Tudo opcional; arquivo com erro é ignorado sozinho.
- Ao abrir, a Lite copia a pasta para o PC e passa `LABFLOW_MARCA_DIR` ao app; a API (`marca.py`, rotas `/marca`, `/marca/logo.png`, `/marca/estilo.css`, sem login) lê uma vez. Mudou a marca: reabrir no PC servidor.
- Cor principal: botões, links e abas; secundária: menu e topo (tons derivados nos temas claro e escuro). Logo no menu e na tela de entrar; o nome também no título da aba.
- **Laudos não mudam:** já saem nos modelos da empresa.
- Fica em `dados`, então a troca da `instalacao` não mexe nela. **Nada da marca vai para o repositório** (só valores fictícios nos testes; `.gitignore` barra `dados/` e `marca/`). Sem a variável (servidor de demonstração), fica o LabFlow.

## O que derruba o servidor (vai no LEIA-ME)
Sair do usuário do Windows, suspender/hibernar, reinício do Windows Update. Troca de turno é só "Trocar de pessoa" no LabFlow.

## Para a TI
Nenhuma liberação de porta ou firewall: o LabFlow escuta só em `127.0.0.1` (neste PC) e roda sem administrador. Um PC por vez; a pasta de rede guarda só os dados.

## Como gerar o pacote
GitHub Actions → "LabFlow Lite (pacote Windows)" (roda em PR de `app/lite/**`, em push na `main` e manual) → baixar `LabFlow-Lite` em Artifacts → descompactar no X:. O mesmo job testa no Windows: abrir do zero sem senha, o outro PC ver o aviso de que já está aberto (sem conectar), encerrar com a cópia conferida e restaurar em outro PC.

## Pendências
- Testar nos PCs do laboratório (Windows 10, rede da empresa), sem precisar liberar porta.
- Limites reais (`limites_nfc`, Howard): carregar pelo app ou por arquivo fora do Git depois do primeiro acesso.
