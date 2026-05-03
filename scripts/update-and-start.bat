@echo off
setlocal
cd /d "%~dp0.."

echo.
echo === [1/4] Git: pull latest ===
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo Not a git repo, skip git pull.
) else (
    git pull --ff-only
    if errorlevel 1 (
        echo WARNING: git pull failed. Fix conflicts or network, then run again.
        echo Continuing with current files...
    )
)

echo.
echo === [2/4] Docker: build all services ===
docker compose -f deploy\docker-compose.yml build
if errorlevel 1 (
    echo ERROR: docker compose build failed.
    exit /b 1
)

echo.
echo === [3/4] Docker: recreate and start containers ===
docker compose -f deploy\docker-compose.yml up -d --force-recreate
if errorlevel 1 (
    echo ERROR: docker compose up failed.
    exit /b 1
)

echo.
echo === [4/4] Status ===
docker compose -f deploy\docker-compose.yml ps

echo.
echo Writer:   http://localhost:8080
echo Admin:    http://localhost:8081
echo Backend:  http://localhost:8000
echo.
pause
