param(
  [string]$Target = "$env:LOCALAPPDATA\Noteon",
  [switch]$NoShortcut,
  [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$zip = Join-Path $root 'dist\Noteon-win64.zip'

if (-not (Test-Path $zip)) { throw "找不到安装包：$zip" }

$tmp = Join-Path $env:TEMP ('noteon-install-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Force -Path $Target | Out-Null

  # 保留已有数据
  $data = Join-Path $Target 'data'
  $keep = $null
  if (Test-Path $data) {
    $keep = Join-Path $env:TEMP ('noteon-data-' + [guid]::NewGuid().ToString('N'))
    Copy-Item $data $keep -Recurse -Force
  }

  Get-ChildItem $tmp | ForEach-Object {
    Copy-Item $_.FullName $Target -Recurse -Force
  }

  if ($keep) {
    if (Test-Path $data) { Remove-Item $data -Recurse -Force }
    Copy-Item $keep $data -Recurse -Force
    Remove-Item $keep -Recurse -Force
  }

  $exe = Join-Path $Target 'Noteon.exe'
  if (-not (Test-Path $exe)) { throw "安装失败，缺少 Noteon.exe" }

  if (-not $NoShortcut) {
    $ws = New-Object -ComObject WScript.Shell
    $desktop = [Environment]::GetFolderPath('Desktop')
    $lnk = $ws.CreateShortcut((Join-Path $desktop 'Noteon.lnk'))
    $lnk.TargetPath = $exe
    $lnk.WorkingDirectory = $Target
    $lnk.IconLocation = $exe
    $lnk.Save()
    $start = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Noteon.lnk'
    $lnk2 = $ws.CreateShortcut($start)
    $lnk2.TargetPath = $exe
    $lnk2.WorkingDirectory = $Target
    $lnk2.IconLocation = $exe
    $lnk2.Save()
  }

  $uninstall = @"
`$ErrorActionPreference = 'SilentlyContinue'
`$target = '$Target'
`$lnk1 = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Noteon.lnk'
`$lnk2 = Join-Path `$env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Noteon.lnk'
Remove-Item `$lnk1 -Force
Remove-Item `$lnk2 -Force
Remove-Item `$target -Recurse -Force
"@
  Set-Content -Path (Join-Path $Target 'uninstall.ps1') -Value $uninstall -Encoding UTF8

  if (-not $NoLaunch) { Start-Process $exe }
  Write-Host "installed: $Target"
}
finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
