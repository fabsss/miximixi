@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "FRONTEND_DIR=%SCRIPT_DIR%frontend"
set "NPM_CLI=C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"

if not exist "%FRONTEND_DIR%\package.json" (
  echo Frontend package.json nicht gefunden unter "%FRONTEND_DIR%".
  exit /b 1
)

if not exist "%NPM_CLI%" (
  echo npm-cli.js nicht gefunden unter "%NPM_CLI%".
  echo Pruefe, ob Node.js auf diesem Rechner installiert ist.
  exit /b 1
)

pushd "%FRONTEND_DIR%"
npx -y node@22.13.1 "%NPM_CLI%" run dev -- --host
set "EXIT_CODE=%ERRORLEVEL%"
popd

exit /b %EXIT_CODE%