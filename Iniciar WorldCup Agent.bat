@echo off
chcp 65001 >nul
title WorldCup Agent
echo ============================================
echo   WorldCup Agent - servidor local
echo ============================================
echo.
echo Iniciando servidor em http://localhost:3456/ ...
start "WorldCup Agent (servidor)" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
echo Aguardando o servidor subir...
timeout /t 2 /nobreak >nul
echo Abrindo no navegador...
start "" "http://localhost:3456/"
echo.
echo Pronto! Use o app pela aba que abriu (http://localhost:3456/).
echo NAO use mais o arquivo direto (file://) - e o que causava o erro de conexao.
echo.
echo Deixe a janela "WorldCup Agent (servidor)" aberta enquanto usar o app.
echo Para encerrar, basta fechar aquela janela.
echo.
pause
