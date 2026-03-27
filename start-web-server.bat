@echo off
echo Starting MJS PrimeLogic Web Server on port 3000...
cd /d "%~dp0"
npx serve . -l 3000 --no-clipboard
pause
