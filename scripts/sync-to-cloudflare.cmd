@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-to-cloudflare.ps1" %*
exit /b %ERRORLEVEL%
