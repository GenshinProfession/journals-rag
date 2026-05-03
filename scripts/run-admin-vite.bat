@echo off
cd /d "%~dp0..\frontend-admin"
call npm install
call npm run dev -- --host 0.0.0.0 --port 5173
