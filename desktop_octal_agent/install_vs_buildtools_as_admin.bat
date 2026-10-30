@echo off
title Install Visual Studio C++ Build Tools
echo ==========================================================
echo    Installing Visual Studio 2022 C++ Build Tools
echo    Workload: Microsoft.VisualStudio.Workload.VCTools
echo ==========================================================
echo.
echo Please allow the Windows Administrator UAC prompt if shown.
echo.

if not exist "%TEMP%\vs_buildtools.exe" (
    echo Downloading vs_buildtools.exe...
    powershell -Command "Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vs_buildtools.exe' -OutFile '%TEMP%\vs_buildtools.exe'"
)

"%TEMP%\vs_buildtools.exe" --passive --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended

echo.
echo Visual Studio C++ Build Tools installation completed.
echo You can now build Flutter Windows apps via:
echo   flutter build windows --release
pause
