@echo off
echo Stopping Orc...
taskkill /f /fi "WINDOWTITLE eq %~dp0*" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3002.*LISTENING"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5180.*LISTENING"') do taskkill /f /pid %%a >nul 2>&1
echo Orc stopped.
timeout /t 2 >nul
