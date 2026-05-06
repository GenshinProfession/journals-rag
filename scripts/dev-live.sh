#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f ".env" ]; then
    echo "未找到 .env，从 .env.example 复制..."
    cp ".env.example" ".env"
fi

echo ""
echo "=== 开发模式：Docker 只跑后端；前端用 Vite 热更新 ==="
echo "Admin:  http://localhost:5173"
echo "Writer: http://localhost:5174"
echo "API:    http://localhost:8000  （Vite 会把 /api 代理到此处）"
echo ""
echo "注意: 若本机已在跑「完整 Docker 栈」，请先停止以免端口冲突："
echo "  docker compose -f deploy/docker-compose.yml down"
echo ""

if ! command -v docker &>/dev/null; then
    echo "ERROR: 未找到 docker，请先安装 Docker。"
    exit 1
fi

echo "[1/2] 启动 postgres / redis / backend / worker ..."
if ! docker compose -f deploy/docker-compose.backend-only.yml up -d --build; then
    echo "ERROR: Docker 启动失败。"
    exit 1
fi

echo ""
echo "[2/2] 在后台运行两个 Vite 进程（保存代码即刷新页面）..."
SCRIPT_DIR="$(dirname "$0")"
bash "$SCRIPT_DIR/run-admin-vite.sh" &
bash "$SCRIPT_DIR/run-writer-vite.sh" &

echo ""
echo "停止后端: docker compose -f deploy/docker-compose.backend-only.yml down"
echo "关掉两个 Vite 进程即可停前端（或执行: kill %1 %2）。"
echo "按 Ctrl+C 退出。"
wait
