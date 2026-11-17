@echo off
rem Double-click to start Mobile-First Dev Tester.
cd /d "%~dp0"
call npm.cmd start
if errorlevel 1 pause
