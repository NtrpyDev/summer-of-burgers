@echo off
setlocal
set "ROOT=%~dp0.."
set "NODE_BIN=%ROOT%\.tools\node-v22.16.0-win-x64"
if exist "%NODE_BIN%\node.exe" (
  set "PATH=%NODE_BIN%;%PATH%"
) else (
  set "CODEX=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
  if exist "%CODEX%\node.exe" set "PATH=%CODEX%;%PATH%"
)
call "%ROOT%\node_modules\.bin\wrangler.cmd" %*
exit /b %ERRORLEVEL%
