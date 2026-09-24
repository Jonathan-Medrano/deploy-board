@echo off
setlocal
rem ESTE ARCHIVO NO SE TOCA. cmd lo lee por posicion mientras corre: si el pull que hace
rem scripts\arrancar.bat lo cambia a mitad de camino, retoma en un offset que ya no existe.
rem Todo lo que pueda cambiar vive en scripts\arrancar.bat, que se ejecuta desde una copia en TEMP.
set "MODO="
set "COPIA=%TEMP%\deploy-board-arrancar-%RANDOM%%RANDOM%.bat"
:otra
copy /y "%~dp0scripts\arrancar.bat" "%COPIA%" >nul
if errorlevel 1 (
  echo   [X] No pude copiar scripts\arrancar.bat a %TEMP%.
  pause
  exit /b 1
)
call "%COPIA%" "%~dp0" %MODO%
if errorlevel 10 if not errorlevel 11 (set "MODO=reinicio" & goto otra)
set "CODIGO=%errorlevel%"
del "%COPIA%" >nul 2>&1
exit /b %CODIGO%
