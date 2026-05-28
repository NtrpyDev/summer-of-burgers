param(
  [string]$Bucket = "summer-of-burgers-images",
  [string]$Database = "summer-of-burgers"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "node-env.ps1")

$Root = Get-ProjectRoot
$Node = Initialize-NodeEnvironment

Push-Location $Root
try {
  foreach ($File in Get-ChildItem "public\images\originals","public\images\thumbs","public\images\fan","public\images\share" -File -ErrorAction SilentlyContinue) {
    $Folder = Split-Path $File.DirectoryName -Leaf
    $Key = "$Folder/$($File.Name)"
    Write-Host "R2 put $Key"
    Invoke-Wrangler r2 object put "$Bucket/$Key" --file $File.FullName --remote
  }

  & $Node "scripts\export-d1-sql.cjs"
  foreach ($Migration in Get-ChildItem "migrations\*.sql" | Sort-Object Name) {
    if ($Migration.Name -eq "0003_launch_reset.sql") {
      continue
    }
    Invoke-Wrangler d1 execute $Database --file $Migration.FullName --remote --yes
  }
  Invoke-Wrangler d1 execute $Database --file "data\seed-burgers.sql" --remote --yes
  Write-Host "Cloudflare sync finished."
}
finally {
  Pop-Location
}
