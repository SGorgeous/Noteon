# Noteon C# / WebView2 host

New native host for Noteon, replacing the Electron runtime with:

- .NET Framework 4.8 WPF
- `Microsoft.Web.WebView2.Wpf.WebView2CompositionControl`
- the existing `renderer/` + `plugins/` HTML/JS/CSS

## Current status

Working:

- transparent frameless card window
- card shell + note / text / image / folder / web / relay / screenshot plugins
- `data/board.json` persistence and Electron-style board loading
- native card context menu (pin, desktop mode, theme, alpha, rename, close)
- control panel + tray + `Ctrl+Alt+N` tiling
- native region screenshot (WPF selection overlay, crop)
- shell context menu registry + single-instance `--new` launch queue
- theme broadcast from panel to cards
- file dialogs, text/image reading, file drag
- auto-start

Known limitation:

- true wallpaper-layer embedding: WPF `SetParent` to the desktop leaves the card invisible.
  It falls back to a safe desktop mode (not topmost, not in taskbar).

## Build / package

```powershell
.\build.ps1
.\pack.ps1
```

`pack.ps1` creates `dist/Noteon-win64.zip` (about 0.47 MB after compression).

## Install

```powershell
.\install.ps1 -Target "$env:LOCALAPPDATA\Noteon"
```

The installer extracts the zip, keeps an existing `data` folder, creates shortcuts,
and writes an `uninstall.ps1` into the target directory.

## Requirements

- Windows 10/11
- .NET Framework 4.8 (built into Windows)
- WebView2 Runtime (Edge, normally installed)

## Size

The host executable is around 60 KB; WebView2 managed DLLs + loader are under 1 MB.
Chromium is provided by the system WebView2 runtime instead of bundled Electron.
