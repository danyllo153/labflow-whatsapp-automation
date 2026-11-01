@echo off
rem LabFlow Lite: abre o LabFlow a partir desta pasta (G:). Este PC vira o servidor ou, se outro PC
rem ja estiver com o LabFlow aberto, so abre o navegador nele. Arquivo em ASCII de proposito.
setlocal
chcp 65001 >nul
title LabFlow
set "RAIZ=%~dp0"
set "LOCAL=%LOCALAPPDATA%\LabFlowLite"
set "PROG=%LOCAL%\programa"
set /p VER=<"%RAIZ%instalacao\VERSAO.txt"
if not exist "%PROG%\versao-%VER%.ok" (
  echo Preparando o LabFlow neste computador. So na primeira vez ou depois de uma atualizacao: 1 a 3 minutos...
  robocopy "%RAIZ%instalacao" "%PROG%" /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS /NP >nul
  if errorlevel 8 (
    echo Nao consegui copiar o programa da pasta de rede. Feche o LabFlow se estiver aberto neste PC e tente de novo.
    pause
    exit /b 1
  )
  echo ok>"%PROG%\versao-%VER%.ok"
)
"%PROG%\python\python.exe" "%PROG%\lite\lite.py" --raiz "%RAIZ%." %*
if errorlevel 1 pause
