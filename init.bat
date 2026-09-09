@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows.ps1" -Mode Start
if errorlevel 1 (
    pause
    exit /b 1
)
