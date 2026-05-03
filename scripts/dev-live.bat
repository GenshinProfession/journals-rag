@echo off
setlocal
cd /d "%~dp0.."

if not exist ".env" (
    echo 未找到 .env，从 .env.example 复制...
    copy /y ".env.example" ".env" >nul
)

echo.
echo === 开发模式：Docker 只跑后端；前端用 Vite 热更新 ===
echo Admin:  http://localhost:5173
echo Writer: http://localhost:5174
echo API:    http://localhost:8000  （Vite 会把 /api 代理到此处）
echo.
echo 注意: 若本机已在跑「完整 Docker 栈」，请先停止以免端口冲突：
echo   docker compose -f deploy\docker-compose.yml down
echo.

where docker >nul 2>&1
if errorlevel 1 (
    echo ERROR: 未找到 docker，请先安装 Docker Desktop。
    pause
    exit /b 1
)

echo [1/2] 启动 postgres / redis / backend / worker ...
docker compose -f deploy\docker-compose.backend-only.yml up -d --build
if errorlevel 1 (
    echo ERROR: Docker 启动失败。
    pause
    exit /b 1
)

echo.
echo [2/2] 打开两个新窗口运行 Vite（保存代码即刷新页面）...
start "Journals RAG - Admin Vite" cmd /k "%~dp0run-admin-vite.bat"
start "Journals RAG - Writer Vite" cmd /k "%~dp0run-writer-vite.bat"

echo.
echo 停止后端: docker compose -f deploy\docker-compose.backend-only.yml down
echo 关掉两个 Vite 窗口即可停前端。
pause
