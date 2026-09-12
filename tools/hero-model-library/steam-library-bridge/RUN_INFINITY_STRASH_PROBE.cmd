@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0probe_infinity_strash.ps1"
echo.
echo The probe ZIP is on your Desktop. No game payload was copied or modified.
pause
