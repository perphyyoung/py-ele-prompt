@echo off
cd /d "%~dp0"
echo Starting Prompt Manager...
echo.
.electron-extracted\electron.exe . --enable-logging
pause
