$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "Starting Journals RAG stack..."
Write-Host "Writer: http://localhost:8080"
Write-Host "Admin : http://localhost:8081"
Write-Host "API   : http://localhost:8000"

docker compose -f "$Root\deploy\docker-compose.yml" up --build
