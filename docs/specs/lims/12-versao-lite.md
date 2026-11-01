# 12 — LabFlow Lite (pasta de rede, sem servidor)

**Pedido:** Henry (diretor da garantia da qualidade), 28/10/2026; desenho fechado com o Danyllo em 01/11.
**Código:** `app/lite/` (lançador, `.bat`, `LEIA-ME.txt`, `montar.ps1`, teste de fumaça) e `.github/workflows/app-lite.yml`.
**O projeto atual não muda:** a Lite é o mesmo app (API, telas e migrations) empacotado para Windows.

## Decisões
- Roda da pasta `G:\Terminal Guarujá\Garantia da Qualidade\Microbiologia\LabFlow`, sem Docker, sem admin, sem internet.
- **Todas as funções do app** e as mesmas regras de usuário e cargo; cada pessoa com o próprio login.
- **Sem bot, sem WhatsApp, sem celular e sem assistente** nesta etapa (ideias para depois: assistente dentro do app e acesso por Wi-Fi).
- **Começa vazio:** só as migrations; na primeira abertura, o usuário `admin` com senha provisória (24 h) na janela.
- **Vários PCs ao mesmo tempo:** o primeiro que abre é o **servidor** (PostgreSQL e app no próprio PC); os outros só abrem o navegador nele (porta 8000). Um PostgreSQL só: sem conflito. Servidor habitual: o PC da micro que fica ligado 24 h (Windows 10).
- **Plano B:** sem a porta liberada pela TI, um PC por vez (o aviso diz quem está com ele aberto).

## Pastas
```
LabFlow\                      (G:)
  Abrir LabFlow.bat  Fechar LabFlow.bat  Testar rede.bat  LEIA-ME.txt
  instalacao\                 trocada inteira a cada versão
    python\ (embutido + dependências)  app\labflow_api\  web\  migrations\  postgres\ (15+)  lite\lite.py  VERSAO.txt
  dados\                      nunca apagar nem substituir
    labflow.dump  labflow.anterior.dump  labflow.info.json  servidor.json  backup\  recuperacao\
%LOCALAPPDATA%\LabFlowLite\   em cada PC
  programa\ (cópia da instalacao)  data\ (PostgreSQL do servidor)  estado.json  lite.log  api.log
```

## Como funciona
1. O `.bat` copia a `instalacao` para o PC quando a versão muda (o PostgreSQL não roda bem de pasta de rede).
2. `servidor.json` no G: diz quem é o servidor; ele renova a data a cada 10 s (hora medida pelo próprio servidor de arquivos). Sem sinal há 45 s, o próximo que abrir assume.
3. Banco: se o `data\` local está em dia com o G: (mesmo `gravado_em`), religa (recupera uma queda sem perder nada); senão restaura o `labflow.dump`. Banco local que ficou para trás depois de uma queda vai para `dados\recuperacao`.
4. Migrations: aplica as que faltam (tabela `public.lite_migracoes`), com backup antes quando não é o banco novo.
5. Cópia no G: a cada 60 s se houve escrita (e a cada 10 min mesmo sem), e ao fechar; `labflow.anterior.dump` e backup do dia (30 dias).
6. Papéis como no servidor (`labflow_app`, `labflow_leitura`, `labflow_app_web`); o app entra como `labflow_app_web`; PostgreSQL só em 127.0.0.1 com senha.
7. Fechar: ENTER + S na janela, `Fechar LabFlow.bat`, ou o X da janela (o Windows dá poucos segundos; o que não couber fica no banco local e volta na próxima abertura no mesmo PC).

## Marca da instalação
- Pasta `dados\marca` no G: (criada na primeira abertura, com um LEIA-ME): `marca.json` (`nome`, `cor_principal`, `cor_secundaria`, em `#rrggbb`), `logo.png` (até 2 MB) e `estilo.css` (até 200 KB, por último). Tudo opcional; arquivo com erro é ignorado sozinho.
- Ao abrir, a Lite copia a pasta para o PC e passa `LABFLOW_MARCA_DIR` ao app; a API (`marca.py`, rotas `/marca`, `/marca/logo.png`, `/marca/estilo.css`, sem login) lê uma vez. Mudou a marca: reabrir no PC servidor.
- Cor principal: botões, links e abas; secundária: menu e topo (tons derivados nos temas claro e escuro). Logo no menu e na tela de entrar; o nome também no título da aba.
- **Laudos não mudam:** já saem nos modelos da empresa.
- Fica em `dados`, então a troca da `instalacao` não mexe nela. **Nada da marca vai para o repositório** (só valores fictícios nos testes; `.gitignore` barra `dados/` e `marca/`). Sem a variável (servidor de demonstração), fica o LabFlow.

## O que derruba o servidor (vai no LEIA-ME)
Sair do usuário do Windows, suspender/hibernar, reinício do Windows Update. Troca de turno é só "Sair" no LabFlow.

## Para a TI
Liberar a porta TCP 8000 de entrada no firewall do PC servidor, só para os PCs do laboratório. Conferir com `Testar rede.bat`. A rede interna usa HTTP (sem criptografia); o Henry está ciente.

## Como gerar o pacote
GitHub Actions → "LabFlow Lite (pacote Windows)" (roda em PR de `app/lite/**`, em push na `main` e manual) → baixar `LabFlow-Lite` em Artifacts → descompactar no G:. O mesmo job testa no Windows: abrir do zero, segundo PC como cliente, fechar e restaurar em outro PC.

## Pendências
- Testar nos PCs do laboratório (Windows 10, rede da empresa) e a liberação da porta.
- Limites reais (`limites_nfc`, Howard): carregar pelo app ou por arquivo fora do Git depois do primeiro acesso.
