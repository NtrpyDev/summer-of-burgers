param(
  [string]$ProjectName = "summer-of-burgers",
  [switch]$SkipSync,
  [switch]$SkipPredeploy
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "node-env.ps1")

$Root = Get-ProjectRoot
$wranglerToml = Join-Path $Root "wrangler.toml"
$toml = Get-Content $wranglerToml -Raw
if ($toml -match 'database_id\s*=\s*"replace-with-cloudflare-d1-id"') {
  throw "Update database_id in wrangler.toml after creating the D1 database."
}

if (!$SkipPredeploy) {
  & (Join-Path $PSScriptRoot "predeploy.ps1")
}

$whoami = & (Get-WranglerCommand) whoami 2>&1 | Out-String
if ($whoami -match "not authenticated") {
  throw "Wrangler is not logged in. Run: .\scripts\wrangler.cmd login"
}

if (!$SkipSync) {
  & (Join-Path $PSScriptRoot "sync-to-cloudflare.ps1")
}

Push-Location $Root
try {
  Write-Host "Deploying Pages project '$ProjectName'..."
  Invoke-Wrangler pages deploy public --project-name $ProjectName
  Write-Host "Deploy finished."
}
finally {
  Pop-Location
}
