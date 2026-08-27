[CmdletBinding()]
param([string]$Target)

$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $ProjectDir 'dist'
$PatchedAsar = Join-Path $DistDir 'app.tibo-patched.asar'
$Transaction = Join-Path $PSScriptRoot 'transaction.mjs'
$Node = (Get-Command node -ErrorAction Stop).Source

if (-not $Target) {
  $Target = (& $Node (Join-Path $PSScriptRoot 'platform.mjs') locate).Trim()
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& $Node (Join-Path $PSScriptRoot 'prepare-install.mjs') --target $Target --patched $PatchedAsar --dist $DistDir
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$Principal = [Security.Principal.WindowsPrincipal]::new($Identity)
$IsAdmin = $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$MachineRoots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
$NeedsAdmin = $MachineRoots | Where-Object { $Target.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1

if ($NeedsAdmin -and -not $IsAdmin) {
  $Arguments = @(
    "`"$Transaction`"", 'install', '--target', "`"$Target`"",
    '--patched', "`"$PatchedAsar`"", '--dist', "`"$DistDir`""
  )
  $Process = Start-Process -FilePath $Node -Verb RunAs -Wait -PassThru -ArgumentList $Arguments
  exit $Process.ExitCode
}

& $Node $Transaction install --target $Target --patched $PatchedAsar --dist $DistDir
exit $LASTEXITCODE
