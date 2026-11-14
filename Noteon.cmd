@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"
if not exist "%~dp0runtime\electron\electron.exe" (
  echo [Noteon] runtime\electron\electron.exe not found.
  echo Put the offline Electron runtime back into runtime\electron.
  pause
  exit /b 1
)
set "APPDIR=%~dp0"
if "%APPDIR:~-1%"=="\" set "APPDIR=%APPDIR:~0,-1%"
start "" "%~dp0runtime\electron\electron.exe" "%APPDIR%"
