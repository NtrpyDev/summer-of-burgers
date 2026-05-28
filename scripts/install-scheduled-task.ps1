param(
  [int]$Minutes = 30,
  [string]$TaskName = "SummerOfBurgersCollector"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$CollectorCmd = Join-Path $PSScriptRoot "run-scheduled-collect.cmd"
$LogFile = Join-Path $Root "data\collector-schedule.log"

if (!(Test-Path $CollectorCmd)) {
  throw "Missing $CollectorCmd"
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root "data") | Out-Null

$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$CollectorCmd`"" -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes $Minutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Poll X API for new Big Cat burger photos, AI-check, sync to summerofburgers.site." -Force
Write-Host "Installed $TaskName - runs every $Minutes minutes."
Write-Host "What it does: asks X API for tweets newer than last check, scans images with AI, uploads burgers."
Write-Host "Your PC must be on (or asleep with task allowed). Log: $LogFile"
Write-Host "Status: .\scripts\collector-status.cmd"
Write-Host "Requires .env with X_BEARER_TOKEN"
