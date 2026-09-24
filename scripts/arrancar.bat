@echo off
setlocal
chcp 65001 >nul
title deploy-board
rem Corre desde una COPIA en TEMP (ver iniciar.bat). %1 = carpeta del sistema;
rem %2 = "reinicio" cuando el boton Actualizar ya trajo el codigo y pidio volver a arrancar.
cd /d "%~1"

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Falta Node. Instala la version LTS desde https://nodejs.org
  echo.
  pause
  exit /b 1
)

if "%~2"=="reinicio" goto servidor

echo.
echo   Buscando novedades del sistema...
git pull --ff-only >nul 2>&1
if errorlevel 1 (
  echo   [!] No traje cambios ^(sin red, sin remoto, o tenes cambios locales^). Arranco igual.
) else (
  echo   Al dia.
)

rem El navegador se abre una sola vez, y recien cuando el servidor contesta: abrirlo antes
rem muestra un error de conexion que se lee como "el sistema no anda". En un reinicio no se
rem abre: la pantalla que ya estaba abierta espera y se recarga sola.
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "for($i=0;$i -lt 40;$i++){try{Invoke-WebRequest http://localhost:4700/api/ping -UseBasicParsing -TimeoutSec 1 ^| Out-Null; Start-Process 'http://localhost:4700'; break}catch{Start-Sleep -Milliseconds 500}}"

:servidor
echo.
echo   deploy-board corriendo en http://localhost:4700
echo   ^(dejá esta ventana abierta; cerrala para apagar el sistema^)
echo.
node src/servidor-cli.js
set "CODIGO=%errorlevel%"

if "%CODIGO%"=="10" (
  echo.
  echo   Se bajo una version nueva. Reiniciando...
  exit /b 10
)

echo.
echo   deploy-board se cerro.
pause
exit /b %CODIGO%
