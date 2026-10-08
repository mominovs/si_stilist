@echo off
rem Oldingi nusxalarni to'xtatish (run-all.bat va run-local.bat): ularning oynalari, 3000/3443-portdagi
rem jarayonlar (masalan demo.bat dagi npm run dev), ngrok va 8001-portdagi SI server. Aks holda port band bo'ladi
echo Oldingi nusxalar to'xtatilmoqda...
taskkill /FI "WINDOWTITLE eq SI Stilist sayt*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq SI kiyintirish serveri*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq SI HTTPS*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq ngrok tunnel*" /T /F >nul 2>&1
taskkill /IM ngrok.exe /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /PID %%p /T /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3443 " ^| findstr LISTENING') do taskkill /PID %%p /T /F >nul 2>&1
call "%~dp0..\tryon-local\stop.bat" >nul 2>&1
timeout /t 2 /nobreak >nul
