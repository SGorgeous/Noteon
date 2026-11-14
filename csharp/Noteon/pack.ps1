param()
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
& (Join-Path $here 'build.ps1') -Package
$dist = Join-Path (Split-Path -Parent $here) 'dist'
$src = Join-Path $dist 'Noteon'
$zip = Join-Path $dist 'Noteon-win64.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $src '*') -DestinationPath $zip -CompressionLevel Optimal
$mb = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host "packed: $zip ($mb MB)"
