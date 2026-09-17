[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port = 9335, [string]$NodePath)
$ErrorActionPreference = 'Stop'
if (!$NodePath) { $NodePath = (Get-Command node -ErrorAction Stop).Source }
& $NodePath (Join-Path $PSScriptRoot 'cdp\runner.mjs') remove --port $Port
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'Theme removed. To close the debugging endpoint too, exit Codex and start it normally without the Tibolution launcher.'
