@echo off
rem Pede para o LabFlow aberto NESTE PC gravar tudo no G: e fechar (o mesmo que teclar ENTER na janela dele).
echo.>"%LOCALAPPDATA%\LabFlowLite\parar.txt"
echo Pedido enviado. A janela do LabFlow fecha sozinha depois de gravar.
timeout /t 5 >nul
