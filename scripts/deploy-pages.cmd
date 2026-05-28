@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-pages.ps1" %*
exit /b %ERRORLEVEL%
