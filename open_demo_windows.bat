@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0open_demo_windows.ps1"
if errorlevel 1 (
  echo.
  echo Failed to start the root demo.
  echo Make sure Windows PowerShell is available.
  echo.
  pause
)

endlocal
