@echo off
title Octal Desktop Agent
echo ===================================================
echo        OCTAL DESKTOP AGENT (EDGE WORKER)
echo   Distributed Automation - 0 Server Load Mode
echo ===================================================
echo.

cd /d "%~dp0"

:: Auto-detect Flutter in standard installation paths if not already in PATH
if exist "C:\src\flutter\bin\flutter.bat" (
    set "PATH=C:\src\flutter\bin;%PATH%"
)

echo [1/3] Checking local engine requirements...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is required. Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo [2/3] Checking dependencies...
if not exist "local_engine\node_modules" (
    echo Installing local engine dependencies...
    cd local_engine && call npm install && cd ..
)

echo [3/3] Launching Octal Desktop Agent...
if exist "build\windows\x64\runner\Release\desktop_octal_agent.exe" (
    echo Starting native Flutter Release binary...
    start "" "build\windows\x64\runner\Release\desktop_octal_agent.exe"
    exit /b 0
)

if exist "OctalDesktopAgent.exe" (
    echo Starting native Octal Desktop Agent GUI...
    start "" "OctalDesktopAgent.exe"
    exit /b 0
)

where flutter >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Starting Flutter Desktop UI via Flutter CLI...
    flutter run -d windows
) else (
    echo Flutter CLI not in PATH. Starting Local Engine interactive console...
    cd local_engine
    node local_cookie_grabber.js
)

pause
