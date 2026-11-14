param()
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
& (Join-Path $here 'build.ps1') -Package
$dist = Join-Path (Split-Path -Parent $here) 'dist'
$src = Join-Path $dist 'Noteon'
$zip = Join-Path $dist 'Noteon-win64.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
$data = Join-Path $src 'data'
$dataTmp = Join-Path ([IO.Path]::GetTempPath()) ('noteon-zipdata-' + [guid]::NewGuid().ToString('N'))
$hadData = Test-Path $data
if ($hadData) { Move-Item $data $dataTmp -Force }
try {
  Compress-Archive -Path (Join-Path $src '*') -DestinationPath $zip -CompressionLevel Optimal
} finally {
  if ($hadData -and (Test-Path $dataTmp)) { Move-Item $dataTmp $data -Force }
}
$mb = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host "packed: $zip ($mb MB)"
