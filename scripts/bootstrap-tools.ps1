$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Tools = Join-Path $Root ".tools"
$NodeVersion = "v22.16.0"
$NodeFolder = "node-$NodeVersion-win-x64"
$NodeDir = Join-Path $Tools $NodeFolder
$ZipPath = Join-Path $Tools "node.zip"
$NodeUrl = "https://nodejs.org/dist/$NodeVersion/$NodeFolder.zip"

New-Item -ItemType Directory -Force -Path $Tools | Out-Null

if (!(Test-Path (Join-Path $NodeDir "node.exe"))) {
  Write-Host "Downloading portable Node $NodeVersion..."
  Invoke-WebRequest -Uri $NodeUrl -OutFile $ZipPath -UseBasicParsing
  Expand-Archive -Path $ZipPath -DestinationPath $Tools -Force
}

$Npm = Join-Path $NodeDir "npm.cmd"
$env:PATH = "$NodeDir;$env:PATH"
$env:npm_config_scripts_prepend_node_path = "true"
Push-Location $Root
try {
  Write-Host "Installing project dependencies (wrangler, sharp, vision)..."
  & $Npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
  Write-Host "Rebuilding sharp for this Node runtime..."
  & $Npm rebuild sharp
  if ($LASTEXITCODE -ne 0) { throw "npm rebuild sharp failed with exit code $LASTEXITCODE" }
  Write-Host "Vision model caches to .cache/transformers on first collector run."
}
finally {
  Pop-Location
}

Write-Host "Tools ready."
Write-Host "  Node:     $(Join-Path $NodeDir 'node.exe')"
Write-Host "  Wrangler: $(Join-Path $Root 'node_modules\.bin\wrangler.cmd')"
Write-Host "Next: .\scripts\wrangler.cmd login"
