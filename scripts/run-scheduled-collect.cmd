@echo off
setlocal
set "ROOT=%~dp0.."
set "LOG=%ROOT%\data\collector-schedule.log"
if not exist "%ROOT%\data" mkdir "%ROOT%\data"
echo.>>"%LOG%"
echo ============================================================>>"%LOG%"
echo [%date% %time%] Scheduled collect-and-sync>>"%LOG%"
echo ============================================================>>"%LOG%"
pushd "%ROOT%"
call "%~dp0collect-and-sync.cmd">>"%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
popd
echo Exit code: %RC%>>"%LOG%"
exit /b %RC%
