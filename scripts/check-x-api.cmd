@echo off
setlocal
set "ROOT=%~dp0.."
set "NODE_BIN=%ROOT%\.tools\node-v22.16.0-win-x64"
if exist "%NODE_BIN%\node.exe" (
  set "PATH=%NODE_BIN%;%PATH%"
) else (
  set "NODE=node"
)
set "NODE=%NODE_BIN%\node.exe"
if not exist "%NODE%" set "NODE=node"
pushd "%ROOT%"
"%NODE%" "%ROOT%\scripts\check-x-api.cjs"
set "ERR=%ERRORLEVEL%"
popd
exit /b %ERR%
