#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f ".env" ]; then
    echo "未找到 .env，从 .env.example 复制..."
    cp ".env.example" ".env"
fi

echo ""
echo "=== Journals RAG: 更新并全量 Docker 部署 ==="

docker_build() {
    echo ""
    echo "=== [2/4] Docker: build 全部服务 ==="
    if ! docker compose -f deploy/docker-compose.yml build; then
        echo "ERROR: docker compose build 失败。"
        exit 1
    fi

    echo ""
    echo "=== [3/4] Docker: 重建并启动容器 ==="
    if ! docker compose -f deploy/docker-compose.yml up -d --force-recreate; then
        echo "ERROR: docker compose up 失败。"
        exit 1
    fi

    echo ""
    echo "=== [4/4] 状态 ==="
    docker compose -f deploy/docker-compose.yml ps

    echo ""
    echo "Writer  http://localhost:8080"
    echo "Admin   http://localhost:8081"
    echo "Backend http://localhost:8000"
    echo ""
    echo "提示: 改前端代码后要重新 build 镜像，或改用 scripts/dev-live.sh 做热更新。"
}

if ! command -v git &>/dev/null; then
    echo "WARNING: 未找到 git，已跳过拉取。请安装 Git 或将 git 加入 PATH。"
    docker_build
    exit 0
fi

if ! command -v docker &>/dev/null; then
    echo "ERROR: 未找到 docker。请安装 Docker。"
    exit 1
fi

if [ "${SKIP_GIT:-0}" = "1" ]; then
    echo "SKIP_GIT=1：跳过 git 拉取。"
    docker_build
    exit 0
fi

echo ""
echo "=== [1/4] Git: 拉取远程（有本地未提交修改时会自动 stash）==="
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    docker_build
    exit 0
fi

if ! git fetch origin; then
    echo "WARNING: git fetch 失败（网络或远程配置）。跳过 pull，沿用当前代码。"
    docker_build
    exit 0
fi

# 有脏工作区时用 autostash，避免 pull 直接报错；无脏工作区时等价于普通 pull
if ! git pull --rebase --autostash origin main 2>/dev/null; then
    if ! git pull --rebase --autostash 2>/dev/null; then
        echo ""
        echo "Git pull 仍失败。常见原因："
        echo "  - 与远程分叉：需要手动 merge / rebase"
        echo "  - 未配置 origin 或无权限"
        echo "  - 改了文件且与远程冲突"
        echo ""
        echo "可设环境变量跳过 git：  SKIP_GIT=1 bash $0"
        echo "或先提交/贮藏本地修改后再 pull。"
        echo ""
        read -rp "仍继续构建 Docker? [Y/n] " GO
        if [[ "${GO,,}" == "n" ]]; then
            exit 1
        fi
    fi
fi

docker_build
