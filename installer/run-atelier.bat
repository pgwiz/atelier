@echo off
setlocal
cd /d "%~dp0"

if exist "atelier-launcher.exe" (
    start "" "atelier-launcher.exe" --portable
) else (
    start "" "atelier.exe" --portable
)

endlocal
