@echo off
rem SI Stilist: lokal demo (internet shart emas). Telefon kompyuter bilan bir Wi-Fi'da yoki kompyuter hotspotida.
rem   - SI kiyintirish serveri, sayt (production) va lokal HTTPS (telefon kamerasi uchun): har biri alohida oynada,
rem     to'xtasa 5 soniyadan keyin o'zi qayta ishga tushadi
rem   - kadrlar tarmoqdan chiqmaydi: jonli oyna ngrok'dagidan ancha tez
rem Hotspot: Windows Sozlamalar -> Tarmoq va Internet -> Mobil hotspot -> Yoqish, telefonni shu tarmoqqa ulang.
cd /d %~dp0
set ROOT=%~dp0
set LAN_HTTPS_PORT=3443
call "%ROOT%scripts\tozala.bat"

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
start "SI HTTPS (telefon uchun)" cmd /k ""%ROOT%scripts\qayta.bat" node scripts\https-proxy.mjs"
start "" cmd /c "timeout /t 20 /nobreak >nul & start http://localhost:3000/admin/holat & start http://localhost:3000/panel"

echo.
echo Hammasi ishga tushdi.
echo   Shu kompyuterda: http://localhost:3000   (panel: /panel, jonli oyna: /oyna)
echo   Telefonda: "SI HTTPS" oynasidagi https://...:3443 manzil yoki QR kod (panelda "Telefondan sinash" ham)
echo   Telefon "Ulanish xavfsiz emas" desa: Qo'shimcha -^> Baribir o'tish. Windows ruxsat so'rasa: Allow.
echo Muhim: kompyuter uyquga ketsa hammasi to'xtaydi: powercfg /change standby-timeout-ac 0
pause
