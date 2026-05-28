@echo off
setlocal
set "ROOT=%~dp0.."
set "LOG=%ROOT%\data\collector-schedule.log"
set "TASK=SummerOfBurgersCollector"
echo.
echo === Scheduled task ===
schtasks /Query /TN "%TASK%" /FO LIST 2>nul
if errorlevel 1 (
  echo Task not installed. Run: .\scripts\install-scheduled-task.cmd
) else (
  echo.
  echo To change interval: .\scripts\install-scheduled-task.cmd 30
)
echo.
echo === Last runs (data\collector-schedule.log) ===
if exist "%LOG%" (
  powershell -NoProfile -Command "Get-Content -Path '%LOG%' -Tail 40"
) else (
  echo No log yet — task has not run or logging not created.
)
echo.
exit /b 0
