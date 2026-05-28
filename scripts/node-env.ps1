function Get-ProjectRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-ProjectNode {
  $codexNode = Join-Path $HOME ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path $codexNode) { return $codexNode }

  $portableNode = Join-Path (Get-ProjectRoot) ".tools\node-v22.16.0-win-x64\node.exe"
  if (Test-Path $portableNode) { return $portableNode }

  throw "Node not found. Run .\scripts\bootstrap-tools.ps1 first."
}

function Get-ProjectNodeModules {
  $codexModules = Join-Path $HOME ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"
  if (Test-Path $codexModules) { return $codexModules }

  $localModules = Join-Path (Get-ProjectRoot) "node_modules"
  if (Test-Path $localModules) { return $localModules }

  throw "node_modules not found. Run .\scripts\bootstrap-tools.ps1 first."
}

function Get-WranglerCommand {
  $root = Get-ProjectRoot
  $localWrangler = Join-Path $root "node_modules\.bin\wrangler.cmd"
  if (Test-Path $localWrangler) { return $localWrangler }

  $globalWrangler = Get-Command wrangler -ErrorAction SilentlyContinue
  if ($globalWrangler) { return $globalWrangler.Source }

  throw "wrangler not found. Run .\scripts\bootstrap-tools.ps1 (npm install) first."
}

function Initialize-NodeEnvironment {
  $env:NODE_PATH = Get-ProjectNodeModules
  return Get-ProjectNode
}

function Invoke-Wrangler {
  param(
    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )
  $node = Get-ProjectNode
  $wranglerJs = Join-Path (Get-ProjectRoot) "node_modules\wrangler\bin\wrangler.js"
  if (!(Test-Path $wranglerJs)) { throw "wrangler not installed. Run .\scripts\bootstrap-tools.cmd first." }
  & $node $wranglerJs @Args
  if ($LASTEXITCODE -ne 0) { throw "wrangler failed with exit code $LASTEXITCODE" }
}
