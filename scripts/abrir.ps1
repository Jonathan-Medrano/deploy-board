# ABRIR - levanta el tablero y abre el navegador.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\abrir.ps1
. "$PSScriptRoot\_comun.ps1"

Assert-Comando "node" "Instala Node 20 o superior."

# sqlcmd solo hace falta para MEDIR. El tablero abre igual y muestra la ultima medicion
# guardada, asi que se avisa en vez de frenar: el que solo viene a mirar no necesita sqlcmd.
if (-not (Get-Command "sqlcmd" -ErrorAction SilentlyContinue)) {
  Aviso "No esta 'sqlcmd': vas a poder ver la ultima medicion, pero el boton de volver a medir va a fallar."
}

$puerto = Get-Puerto
Info "Levantando deploy-board en http://localhost:$puerto ..."
Start-Job -ScriptBlock {
  param($p)
  for ($i = 0; $i -lt 30; $i++) {
    try {
      Invoke-WebRequest -Uri "http://localhost:$p/api/ping" -UseBasicParsing -TimeoutSec 1 | Out-Null
      Start-Process "http://localhost:$p"
      return
    } catch { Start-Sleep -Milliseconds 500 }
  }
} -ArgumentList $puerto | Out-Null
Push-Location $RepoRoot
try {
  node src/servidor-cli.js
} finally { Pop-Location }
