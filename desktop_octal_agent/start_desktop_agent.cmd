@echo off
title Octal Desktop Agent
echo ===================================================
echo        OCTAL DESKTOP AGENT (EDGE WORKER)
echo   Distributed Automation - 0 Server Load Mode
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/2] Checking local engine requirements...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is required. Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo [2/2] Launching Octal Desktop Agent GUI...
where flutter >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Starting Flutter Desktop UI...
    flutter run -d windows
) else (
    echo Flutter CLI not in PATH. Starting Local Engine interactive console...
    cd local_engine
    node local_cookie_grabber.js
)

pause
