@echo off
cd /d "%~dp0"
echo [MultiChat] Starting dev server...
npx tauri dev
pause
