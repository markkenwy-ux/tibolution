[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = 'Stop'
$destinationPath = [System.IO.Path]::GetFullPath($Destination)
$backupPath = "$destinationPath.tibo-replace-backup.$([guid]::NewGuid().ToString('N'))"

try {
  [System.IO.File]::Replace($Source, $destinationPath, $backupPath, $true)
}
catch {
  if ([System.IO.File]::Exists($backupPath)) {
    Write-Warning "Atomic replacement failed; the original destination backup was retained at: $backupPath"
  }
  throw
}

try {
  [System.IO.File]::Delete($backupPath)
}
catch {
  Write-Warning "Atomic replacement succeeded, but its temporary backup could not be removed: $backupPath"
}
