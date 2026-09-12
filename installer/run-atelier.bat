@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo   Starting Atelier Studio (Portable Mode)
echo ===================================================
echo.
echo Opening Atelier in your default browser...
echo Press Ctrl+C in this console window to stop server.
echo.

start atelier.exe --portable

endlocal
