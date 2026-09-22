@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Instalar deploy-board

echo.
echo   ============================================================
echo     deploy-board  -  instalador
echo.
echo     Antes de subir scripts al FileZilla, te dice cuales
echo     faltan en cada ambiente y quien los tiene que correr.
echo   ============================================================
echo.
echo   Se va a instalar en:
echo     %~dp0deploy-board
echo.
echo   (si no es aca, cerra esta ventana, move el .bat a donde
echo    quieras y volve a ejecutarlo)
echo.
pause

echo.
echo   [1/4] Revisando que este todo lo necesario...

where git >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [X] Falta Git.
  echo       Bajalo de https://git-scm.com/download/win , instalalo
  echo       con las opciones por defecto, y volve a correr esto.
  echo.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [X] Falta Node.
  echo       Baja la version LTS de https://nodejs.org , instalala,
  echo       CERRA esta ventana y volve a correr esto.
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set MAYOR=%%v
if !MAYOR! LSS 18 (
  echo.
  echo   [X] Tu Node es muy viejo ^(v!MAYOR!^). Hace falta 18 o mas.
  echo       Actualizalo desde https://nodejs.org
  echo.
  pause
  exit /b 1
)
echo         Git OK  -  Node v!MAYOR! OK

set "DESTINO=%~dp0deploy-board"

echo.
echo   [2/4] Bajando el sistema...

if exist "%DESTINO%.git" (
  echo         Ya estaba instalado. Actualizando...
  git -C "%DESTINO%" pull --ff-only
  if errorlevel 1 (
    echo.
    echo   [!] No pude actualizar esa copia. Si le tocaste archivos,
    echo       guardalos aparte y borra la carpeta deploy-board.
    echo.
    pause
    exit /b 1
  )
) else (
  rem gh maneja solo el acceso al repo privado si el dev ya inicio sesion.
  rem Sin gh se usa git, que abre la ventana de login de GitHub la primera vez.
  where gh >nul 2>&1
  if errorlevel 1 (
    git clone https://github.com/Jonathan-Medrano/deploy-board.git "%DESTINO%"
  ) else (
    gh repo clone Jonathan-Medrano/deploy-board "%DESTINO%"
  )
  if errorlevel 1 (
    echo.
    echo   ============================================================
    echo   [X] No pude bajar el sistema.
    echo.
    echo   El repositorio es publico, asi que no hace falta
    echo   ninguna cuenta ni permiso. Suele ser una de estas dos:
    echo.
    echo     1. Sin internet, o el proxy/VPN de la oficina bloquea
    echo        github.com. Probalo abriendo esta direccion en el
    echo        navegador:
    echo        https://github.com/Jonathan-Medrano/deploy-board
    echo.
    echo     2. Git recien instalado y esta ventana quedo vieja.
    echo        Cerrala, abri una nueva y volve a ejecutar.
    echo.
    echo   Si nada de eso es, avisale a Jonathan con el texto
    echo   de error que salio arriba.
    echo   ============================================================
    echo.
    pause
    exit /b 1
  )
)

echo.
echo   [3/4] Dejando el acceso directo en el Escritorio...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d=[Environment]::GetFolderPath('Desktop');" ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'deploy-board.lnk'));" ^
  "$s.TargetPath='%DESTINO%iniciar.bat';" ^
  "$s.WorkingDirectory='%DESTINO%';" ^
  "$s.Description='Antes de subir: que scripts faltan y quien los corre';" ^
  "$s.Save()"
if errorlevel 1 (
  echo         [!] No pude crear el acceso directo. Abrilo a mano desde:
  echo             %DESTINO%iniciar.bat
) else (
  echo         Listo: "deploy-board" en el Escritorio.
)

echo.
echo   [4/4] Preparando la configuracion...
if not exist "%DESTINO%.env" (
  copy /y "%DESTINO%.env.example" "%DESTINO%.env" >nul
  echo         Se creo el archivo .env a partir del ejemplo.
) else (
  echo         Ya tenias un .env: no lo toque.
)

echo.
echo   ============================================================
echo   Instalado.
echo.
echo   FALTA UN PASO y sin esto no mide nada:
echo.
echo     Abrir este archivo y completar las claves:
echo       %DESTINO%.env
echo.
echo     Son AZURE_PAT y las credenciales de la base.
echo     Pedilas por el canal del equipo - no estan en el repo
echo     a proposito.
echo.
echo   Despues: doble click en "deploy-board" del Escritorio.
echo   ============================================================
echo.

choice /c SN /n /m "   Abro el .env ahora para completarlo? [S/N] "
if errorlevel 2 goto fin
notepad "%DESTINO%.env"

:fin
echo.
pause
