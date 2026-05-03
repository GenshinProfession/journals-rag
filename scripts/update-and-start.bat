@echo off
setlocal
cd /d "%~dp0.."

echo.
echo === Journals RAG: 更新并全量 Docker 部署 ===

where git >nul 2>&1
if errorlevel 1 (
    echo WARNING: 未找到 git，已跳过拉取。请安装 Git for Windows 或将 git 加入 PATH。
    goto docker_build
)

where docker >nul 2>&1
if errorlevel 1 (
    echo ERROR: 未找到 docker。请安装 Docker Desktop。
    pause
    exit /b 1
)

if "%SKIP_GIT%"=="1" (
    echo SKIP_GIT=1：跳过 git 拉取。
    goto docker_build
)

echo.
echo === [1/4] Git: 拉取远程（有本地未提交修改时会自动 stash）===
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto docker_build

git fetch origin
if errorlevel 1 (
    echo WARNING: git fetch 失败（网络或远程配置）。跳过 pull，沿用当前代码。
    goto docker_build
)

REM 有脏工作区时用 autostash，避免 pull 直接报错；无脏工作区时等价于普通 pull
git pull --rebase --autostash origin main 2>nul
if errorlevel 1 (
    git pull --rebase --autostash 2>nul
)
if errorlevel 1 (
    echo.
    echo Git pull 仍失败。常见原因：
    echo   - 与远程分叉：需要手动 merge / rebase
    echo   - 未配置 origin 或无权限
    echo   - 改了文件且与远程冲突
    echo.
    echo 可设环境变量跳过 git：  set SKIP_GIT=1  再运行本脚本
    echo 或先提交/贮藏本地修改后再 pull。
    echo.
    set /p GO=仍继续构建 Docker? [Y/n] 
    if /i "%GO%"=="n" exit /b 1
)

:docker_build
echo.
echo === [2/4] Docker: build 全部服务 ===
docker compose -f deploy\docker-compose.yml build
if errorlevel 1 (
    echo ERROR: docker compose build 失败。
    pause
    exit /b 1
)

echo.
echo === [3/4] Docker: 重建并启动容器 ===
docker compose -f deploy\docker-compose.yml up -d --force-recreate
if errorlevel 1 (
    echo ERROR: docker compose up 失败。
    pause
    exit /b 1
)

echo.
echo === [4/4] 状态 ===
docker compose -f deploy\docker-compose.yml ps

echo.
echo Writer  http://localhost:8080
echo Admin   http://localhost:8081
echo Backend http://localhost:8000
echo.
echo 提示: 改前端代码后要重新 build 镜像，或改用 scripts\dev-live.bat 做热更新。
pause
