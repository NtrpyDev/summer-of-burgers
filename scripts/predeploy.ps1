$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "node-env.ps1")

$Node = Initialize-NodeEnvironment
$Root = Get-ProjectRoot

Push-Location $Root
try {
  Write-Host "Running smoke test..."
  & $Node "scripts\smoke-test.cjs"

  Write-Host "Generating share cards..."
  & $Node "scripts\generate-share-cards.cjs"

  Write-Host "Exporting D1 seed SQL..."
  & $Node "scripts\export-d1-sql.cjs"

  Write-Host "Predeploy checks finished."
}
finally {
  Pop-Location
}
