@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"
"%~dp0runtime\electron\electron.exe" "%~dp0" --enable-logging
