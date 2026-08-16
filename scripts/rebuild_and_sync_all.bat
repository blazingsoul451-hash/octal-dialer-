@echo off
setlocal enabledelayedexpansion

echo ===============================================================================
echo   OCTAL DIALER — MASTER AUTOMATED BUILD, SYNC ^& DEPLOY PIPELINE
echo ===============================================================================
echo.

set ROOT_DIR=%~dp0..
set FLUTTER_DIR=%ROOT_DIR%\application_octal_dialer
set BACKEND_DIR=%ROOT_DIR%\website_octal_dialer\backend
set FRONTEND_DIR=%ROOT_DIR%\website_octal_dialer\frontend
set OUTPUT_APK=%FLUTTER_DIR%\build\app\outputs\flutter-apk\app-debug.apk

echo [1/5] Building Flutter Android APK...
cd /d "%FLUTTER_DIR%"
call flutter build apk --debug
if errorlevel 1 (
    echo [ERROR] Flutter build failed!
    goto :error
)

if not exist "%OUTPUT_APK%" (
    echo [ERROR] Expected APK output not found at: %OUTPUT_APK%
    goto :error
)

echo.
echo [2/5] Auto-Synchronizing APK build to distribution endpoints...
copy /Y "%OUTPUT_APK%" "%BACKEND_DIR%\data\OctalDialer.apk" >nul
copy /Y "%OUTPUT_APK%" "%FRONTEND_DIR%\public\OctalDialer.apk" >nul
copy /Y "%OUTPUT_APK%" "%USERPROFILE%\Desktop\OctalDialer.apk" >nul
echo       - Synced to backend/data/OctalDialer.apk
echo       - Synced to frontend/public/OctalDialer.apk
echo       - Synced to Desktop\OctalDialer.apk

echo.
echo [3/5] Building Backend TypeScript Engine...
cd /d "%BACKEND_DIR%"
call npm run build
if errorlevel 1 (
    echo [ERROR] Backend build failed!
    goto :error
)

echo.
echo [4/5] Building Frontend SPA Production Bundle...
cd /d "%FRONTEND_DIR%"
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed!
    goto :error
)

echo.
echo [5/5] Restarting Background Backend Daemon on Port 3000...
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"
timeout /t 2 /nobreak >nul

cd /d "%BACKEND_DIR%"
start /b node dist/server.js

echo.
echo ===============================================================================
echo   SUCCESS! All components built, synchronized, and deployed live.
echo ===============================================================================
echo.
exit /b 0

:error
echo.
echo [FAILURE] Build pipeline encountered errors. Please check the logs above.
exit /b 1
