@echo off
setlocal

rem ─────────────────────────────────────────────────────────────────────────
rem  Miximixi – Local Backend Development Server
rem
rem  Starts uvicorn with hot-reload for local development.
rem  IMPORTANT: Telegram bot + Instagram sync are DISABLED here so this
rem  dev instance does NOT compete with the production server's bot polling.
rem  (Two instances sharing the same TELEGRAM_BOT_TOKEN → 409 Conflict)
rem
rem  Prerequisites:
rem    1. docker compose -f docker-compose.dev.yml up -d   (DB + Ollama)
rem    2. cd backend && poetry install
rem    3. Run this script
rem ─────────────────────────────────────────────────────────────────────────

set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%backend"

if not exist "%BACKEND_DIR%\pyproject.toml" (
  echo pyproject.toml nicht gefunden unter "%BACKEND_DIR%".
  exit /b 1
)

rem Disable Telegram bot and Instagram sync for local dev.
rem The production server (Proxmox Docker) uses its own .env with the real token.
set TELEGRAM_BOT_TOKEN=
set INSTAGRAM_SYNC_ENABLED=false

pushd "%BACKEND_DIR%"
echo Starting backend dev server (bot disabled)...
poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
popd
