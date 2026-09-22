@echo off
setlocal
chcp 65001 >nul
title deploy-board

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Falta Node. Instala la version LTS desde https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo.
echo   Buscando novedades del sistema...
git pull --ff-only >nul 2>&1
if errorlevel 1 (
  echo   [!] No traje cambios ^(sin red, sin remoto, o tenes cambios locales^). Arranco igual.
) else (
  echo   Al dia.
)

rem El navegador se abre una sola vez, y recien cuando el servidor contesta: abrirlo antes
rem muestra un error de conexion que se lee como "el sistema no anda".
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "for($i=0;$i -lt 40;$i++){try{Invoke-WebRequest http://localhost:4700/api/ping -UseBasicParsing -TimeoutSec 1 ^| Out-Null; Start-Process 'http://localhost:4700'; break}catch{Start-Sleep -Milliseconds 500}}"

:arrancar
echo.
echo   deploy-board corriendo en http://localhost:4700
echo   ^(dejá esta ventana abierta; cerrala para apagar el sistema^)
echo.
node src/servidor-cli.js

rem Codigo 10 = el boton "Actualizar" bajo codigo nuevo y pidio reiniciar solo.
if errorlevel 10 if not errorlevel 11 (
  echo.
  echo   Se bajo una version nueva. Reiniciando...
  goto arrancar
)

echo.
echo   deploy-board se cerro.
pause
