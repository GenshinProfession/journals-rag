param(
  [switch]$Build
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "== Python compile check =="
python -m compileall "$Root\backend"

Write-Host "== Docker compose config check =="
docker compose -f "$Root\deploy\docker-compose.yml" config | Out-Null

if ($Build) {
  Write-Host "== Docker compose build =="
  docker compose -f "$Root\deploy\docker-compose.yml" build
}

Write-Host "Smoke checks completed."
