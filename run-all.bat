@echo off
rem SI Stilist: hammasini bitta tugma bilan ishga tushirish (internetga ochiq, HTTPS, telefonda ham ishlaydi).
rem   - SI kiyintirish serveri (tryon-local), sayt (production) va ngrok tunnel: har biri alohida oynada
rem   - biror qismi to'xtab qolsa, 5 soniyadan keyin o'zi qayta ishga tushadi (kompyuter o'chguncha ishlaydi)
rem Birinchi marta:
rem   1) winget install ngrok.ngrok
rem   2) ngrok config add-authtoken ^<dashboard.ngrok.com dagi token^>
rem   3) .env: ADMIN_PASSWORD=kuchli-parol, LLM_DAILY_LIMIT=100, NGROK_DOMAIN=sizning-nom.ngrok-free.dev
cd /d %~dp0
set ROOT=%~dp0
node scripts/public-check.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
where ngrok >nul 2>nul
if errorlevel 1 (
  echo ngrok topilmadi. O'rnating: winget install ngrok.ngrok
  echo Keyin tokenni ulang: ngrok config add-authtoken ^<dashboard.ngrok.com dagi token^>
  pause
  exit /b 1
)

if exist "%ROOT%tryon-local\.venv\Scripts\python.exe" (
  start "SI kiyintirish serveri" cmd /k ""%ROOT%scripts\qayta.bat" "%ROOT%tryon-local\start.bat""
) else (
  echo Lokal kiyintirish o'rnatilmagan ^(tryon-local\setup.bat^): kiyintirish demo rejimda ishlaydi.
)

echo Sayt yig'ilmoqda (npm run build), 1-2 daqiqa...
call npm run build
if errorlevel 1 (
  echo Yig'ishda xato. Yuqoridagi xabarni o'qing.
  pause
  exit /b 1
)
start "SI Stilist sayt" cmd /k ""%ROOT%scripts\qayta.bat" npm start"

set NGROK_DOMAIN=
for /f "usebackq delims=" %%d in (`node scripts/public-check.mjs --domain`) do set NGROK_DOMAIN=%%d
if defined NGROK_DOMAIN (
  start "ngrok tunnel" cmd /k ""%ROOT%scripts\qayta.bat" ngrok http --url=%NGROK_DOMAIN% 3000"
  start "" cmd /c "timeout /t 25 /nobreak >nul & start https://%NGROK_DOMAIN%/admin/holat"
  echo.
  echo Sayt manzili: https://%NGROK_DOMAIN%
  echo   Xaridor ekrani: https://%NGROK_DOMAIN%/
  echo   Do'kon paneli:  https://%NGROK_DOMAIN%/panel   ^(telefon uchun QR kod ham shu yerda^)
  echo   Jonli oyna:     https://%NGROK_DOMAIN%/oyna
) else (
  start "ngrok tunnel" cmd /k ""%ROOT%scripts\qayta.bat" ngrok http 3000"
  echo.
  echo Manzil "ngrok tunnel" oynasidagi "Forwarding" qatorida ^(har safar boshqacha^).
)
echo.
echo Hammasi ishga tushdi. Bu oynani yopsa bo'ladi, qolgan uchta oyna ishlab turadi.
echo Muhim: kompyuter uyqu rejimiga o'tsa sayt to'xtaydi. Quvvatga ulanganda uyquni o'chirish:
echo   powercfg /change standby-timeout-ac 0
pause
