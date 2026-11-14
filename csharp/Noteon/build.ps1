param(
  [switch]$Package
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path -Parent (Split-Path -Parent $here)
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$wf = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF'
$fw = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$lib = Join-Path $root 'csharp\lib\webview2'
$out = Join-Path $here 'Noteon.exe'

if (-not (Test-Path $csc)) { throw "csc.exe not found: $csc" }
if (-not (Test-Path (Join-Path $lib 'Microsoft.Web.WebView2.Wpf.dll'))) { throw "WebView2 SDK not found: $lib" }

$cscArgs = @(
  '-nologo', '-target:winexe', '-platform:x64', "-out:$out",
  "-r:$wf\PresentationFramework.dll",
  "-r:$wf\PresentationCore.dll",
  "-r:$wf\WindowsBase.dll",
  "-r:$fw\System.Xaml.dll",
  "-r:$fw\System.dll",
  "-r:$fw\System.Drawing.dll",
  "-r:$fw\System.Web.Extensions.dll",
  "-r:$fw\System.Windows.Forms.dll",
  "-r:$lib\Microsoft.Web.WebView2.Core.dll",
  "-r:$lib\Microsoft.Web.WebView2.Wpf.dll",
  (Join-Path $here 'Program.cs'),
  (Join-Path $here 'Store.cs'),
  (Join-Path $here 'CardWindow.cs'),
  (Join-Path $here 'PanelWindow.cs'),
  (Join-Path $here 'RegionWindow.cs'),
  (Join-Path $here 'ShellMenu.cs'),
  (Join-Path $here 'AutoStart.cs')
)

& $csc @cscArgs
if ($LASTEXITCODE -ne 0) { throw "compile failed: $LASTEXITCODE" }

Copy-Item (Join-Path $lib 'Microsoft.Web.WebView2.Core.dll') $here -Force
Copy-Item (Join-Path $lib 'Microsoft.Web.WebView2.Wpf.dll') $here -Force
Copy-Item (Join-Path $lib 'WebView2Loader.dll') $here -Force

Write-Host "built: $out"
Get-ChildItem $here -File | Where-Object { $_.Name -match '^(Noteon\.exe|Microsoft\.Web\.WebView2\.|WebView2Loader)' } |
  Select-Object Name, @{n='KB'; e={[math]::Round($_.Length / 1KB, 1)}} |
  Format-Table -AutoSize

if ($Package) {
  $dist = Join-Path $root 'csharp\dist\Noteon'
  if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
  New-Item -ItemType Directory -Path $dist | Out-Null
  Copy-Item $out $dist
  Copy-Item (Join-Path $here 'bridge.js') $dist
  Copy-Item (Join-Path $lib 'Microsoft.Web.WebView2.Core.dll') $dist
  Copy-Item (Join-Path $lib 'Microsoft.Web.WebView2.Wpf.dll') $dist
  Copy-Item (Join-Path $lib 'WebView2Loader.dll') $dist
  Copy-Item (Join-Path $root 'renderer') $dist -Recurse
  Copy-Item (Join-Path $root 'plugins') $dist -Recurse
  Copy-Item (Join-Path $root 'assets') $dist -Recurse
  Write-Host "packaged: $dist"
}
