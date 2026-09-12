@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0steam_bridge_gui.ps1"
set "GGD_STEAM_BRIDGE_EXIT=%ERRORLEVEL%"

if not "%GGD_STEAM_BRIDGE_EXIT%"=="0" (
  echo.
  echo GGD Steam Bridge failed with exit code %GGD_STEAM_BRIDGE_EXIT%.
  pause
)

exit /b %GGD_STEAM_BRIDGE_EXIT%
