# Rebuild nginx frontends so Docker reflects your latest React sources.
# Production images bake `npm run build` — `docker compose up` alone does NOT
# re-run the build when you edit files on the host.
#
# From repo root:
#   docker compose -f deploy/docker-compose.yml build admin-web writer-web
#   docker compose -f deploy/docker-compose.yml up -d admin-web writer-web
#
# Or run this script.

Set-Location $PSScriptRoot/..
docker compose -f deploy/docker-compose.yml build admin-web writer-web
docker compose -f deploy/docker-compose.yml up -d admin-web writer-web
