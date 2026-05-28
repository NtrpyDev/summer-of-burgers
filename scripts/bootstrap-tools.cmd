@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap-tools.ps1" %*
exit /b %ERRORLEVEL%
