# Helpers compartidos por los scripts. No se ejecuta solo.
$ErrorActionPreference = "Stop"

$Global:RepoRoot = Split-Path -Parent $PSScriptRoot

function Assert-Comando($nombre, $ayuda) {
  if (-not (Get-Command $nombre -ErrorAction SilentlyContinue)) {
    throw "Falta '$nombre'. $ayuda"
  }
}

function Info($msg)  { Write-Host ">> $msg" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "OK $msg" -ForegroundColor Green }
function Aviso($msg) { Write-Host "!! $msg" -ForegroundColor Yellow }

function Get-Puerto {
  $puerto = 4700
  $envFile = Join-Path $Global:RepoRoot ".env"
  if (Test-Path $envFile) {
    $linea = Select-String -Path $envFile -Pattern '^\s*DEPLOY_BOARD_PORT\s*=\s*(\d+)' | Select-Object -First 1
    if ($linea) { $puerto = [int]$linea.Matches[0].Groups[1].Value }
  }
  return $puerto
}
