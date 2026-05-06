#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../frontend-admin"
npm install
npm run dev -- --host 0.0.0.0 --port 5173
