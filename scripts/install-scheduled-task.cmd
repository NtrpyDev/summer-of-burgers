@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-scheduled-task.ps1" %*
exit /b %ERRORLEVEL%
