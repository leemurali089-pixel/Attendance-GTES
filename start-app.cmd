@echo off
setlocal
REM Bypass PowerShell execution policy issues with npm.ps1; ensure Node is on PATH for Electron.
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install from https://nodejs.org or add it to PATH.
  pause
  exit /b 1
)

if not exist "node_modules\electron\cli.js" (
  echo Run: npm install
  pause
  exit /b 1
)

node "%~dp0node_modules\electron\cli.js" "%~dp0."
endlocal
