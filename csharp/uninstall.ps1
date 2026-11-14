param([string]$Target = "$env:LOCALAPPDATA\Noteon")
$ErrorActionPreference = 'SilentlyContinue'
$lnk1 = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Noteon.lnk'
$lnk2 = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Noteon.lnk'
Remove-Item $lnk1 -Force
Remove-Item $lnk2 -Force
Remove-Item $Target -Recurse -Force
Write-Host "removed: $Target"
