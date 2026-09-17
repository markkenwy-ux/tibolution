[CmdletBinding()]
param(
  [ValidateRange(1024,65535)][int]$Port = 9335,
  [switch]$RestartExisting,
  [switch]$Watch,
  [string]$NodePath
)
$ErrorActionPreference = 'Stop'
if (!$NodePath) { $NodePath = (Get-Command node -ErrorAction Stop).Source }
$Runner = Join-Path $PSScriptRoot 'cdp\runner.mjs'
$Package = Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
if (!$Package) { throw 'Official OpenAI.Codex package not found.' }
$Executable = Join-Path $Package.InstallLocation 'app\ChatGPT.exe'
if (!(Test-Path -LiteralPath $Executable)) { throw 'Codex executable not found.' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
if ($Listeners.Count -eq 0) {
  $Existing = @(Get-Process ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Executable })
  if ($Existing.Count -gt 0) {
    if (!$RestartExisting) { throw 'Codex is running without CDP. Exit it first, or explicitly use -RestartExisting after saving work.' }
    foreach ($Process in $Existing) { if ($Process.MainWindowHandle -ne 0) { [void]$Process.CloseMainWindow() } }
    $Deadline = (Get-Date).AddSeconds(20)
    do {
      Start-Sleep -Milliseconds 300
      $Existing = @(Get-Process ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Executable })
    } while ($Existing.Count -gt 0 -and (Get-Date) -lt $Deadline)
    if ($Existing.Count -gt 0) { throw 'Codex did not exit normally. Exit it from its menu and retry. No force-kill was performed.' }
  }
  # The user explicitly starts this interactive application; helpers stay hidden.
  Start-Process -FilePath $Executable -ArgumentList @("--remote-debugging-port=$Port", '--remote-debugging-address=127.0.0.1') | Out-Null
  $Deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 500
    $Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  } while ($Listeners.Count -eq 0 -and (Get-Date) -lt $Deadline)
  if ($Listeners.Count -eq 0) { throw 'Codex did not expose CDP. This version may not support the launch flags.' }
}
# The runner independently verifies every listener address and owning executable.
& $NodePath $Runner apply --port $Port
if ($LASTEXITCODE -ne 0) { throw 'Tibolution verification failed; inspect the result and use stop-windows-cdp.ps1 to remove it.' }
if ($Watch) {
  $StateRoot = Join-Path $env:LOCALAPPDATA 'Tibolution\cdp'
  New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
  $Watcher = Start-Process -FilePath $NodePath -ArgumentList @(('"' + $Runner + '"'), 'watch', '--port', "$Port") -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $StateRoot "$Port.stdout.log") -RedirectStandardError (Join-Path $StateRoot "$Port.stderr.log")
  Write-Output "Watcher started: $($Watcher.Id). Use stop-windows-cdp.ps1 to remove the theme."
}
