@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& { $n = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'; if (!(Test-Path $n)) { $n = 'node' }; & $n '%~dp0prune-archive.cjs' }"
exit /b %ERRORLEVEL%
