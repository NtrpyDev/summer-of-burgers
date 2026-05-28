@echo off
setlocal
set "ROOT=%~dp0.."
pushd "%ROOT%"
echo.
echo === Collecting new burger tweets from X ===
call "%~dp0collector.cmd" %*
if errorlevel 1 exit /b %errorlevel%
echo.
echo === Uploading to summerofburgers.site ===
call "%~dp0predeploy.cmd"
if errorlevel 1 exit /b %errorlevel%
call "%~dp0sync-to-cloudflare.cmd"
popd
exit /b %ERRORLEVEL%
