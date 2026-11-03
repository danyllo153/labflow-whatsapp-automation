@echo off
rem Gera uma NOVA senha provisoria (24 h) para o usuario Admin. Use quando a senha foi perdida.
rem Feche o LabFlow em TODOS os PCs antes (icone perto do relogio > Encerrar). Arquivo em ASCII de proposito.
title Redefinir senha do Admin - LabFlow
echo.
echo  REDEFINIR A SENHA DO ADMIN
echo  --------------------------
echo  1. O LabFlow precisa estar FECHADO em todos os PCs
echo     (icone perto do relogio ^> Encerrar o LabFlow).
echo  2. Vai aparecer uma janela preta com o usuario e a NOVA SENHA PROVISORIA.
echo     ANOTE a senha antes de fechar a janela. Ela vale 24 horas.
echo  3. Entre no LabFlow e troque a senha.
echo.
echo  Os dados e os outros usuarios nao sao alterados.
echo.
pause
call "%~dp0Abrir LabFlow com janela.bat" --redefinir-admin
