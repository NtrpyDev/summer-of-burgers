@echo off
setlocal
set "ROOT=%~dp0.."
set "NODE_BIN=%ROOT%\.tools\node-v22.16.0-win-x64"
set "CODEX=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node"
if exist "%NODE_BIN%\node.exe" (
  set "PATH=%NODE_BIN%;%PATH%"
  set "NODE_PATH=%CODEX%\node_modules"
) else if exist "%CODEX%\bin\node.exe" (
  set "PATH=%CODEX%\bin;%PATH%"
  set "NODE_PATH=%CODEX%\node_modules"
)
set "NODE=%NODE_BIN%\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" "%ROOT%\scripts\collector.cjs" %*
exit /b %ERRORLEVEL%
