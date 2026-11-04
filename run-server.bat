@echo off
rem SI Stilist: doimiy server rejimi (sistilist.uz, Cloudflare Tunnel orqali internetga ochiq).
rem   - SI kiyintirish serveri va sayt (production): har biri alohida oynada, to'xtasa 5 soniyadan keyin qayta yonadi
rem   - sayt faqat 127.0.0.1 da tinglaydi: tashqaridan faqat Cloudflare orqali kiriladi (Wi-Fi'dagi begonalar emas)
rem   - admin va panel doim parol bilan (OPEN_ACCESS majburan o'chiriladi)
rem Birinchi marta:
rem   1) .env: ADMIN_PASSWORD=kamida-12-belgili-parol, LLM_DAILY_LIMIT=100
rem   2) Cloudflare Zero Trust -> Networks -> Tunnels: tunnel yaratib, "cloudflared service install <token>" ni
rem      administrator PowerShell'da bajaring; Public hostname: sistilist.uz -> http://localhost:3000
rem   3) Kompyuter yonganda o'zi ishga tushishi uchun: scripts\autostart.bat (administrator sifatida)
cd /d %~dp0
set ROOT=%~dp0
set OPEN_ACCESS=0
set BEHIND_CLOUDFLARE=1
set LAN_HTTPS_PORT=
rem Faqat jonli oyna (foydalanuvchi qarori): rasmli kiyintirish (CatVTON) yuklanmaydi, "O'zimda ko'rish" oynaga
rem olib boradi. Rasmli rejimni qaytarish: avval terminalda  set TRYON_MIRROR_ONLY=0
if not defined TRYON_MIRROR_ONLY set TRYON_MIRROR_ONLY=1
if not defined TRYON_PRESET set TRYON_PRESET=orta
if not defined TRYON_MAX_QUEUE set TRYON_MAX_QUEUE=2

node scripts/public-check.mjs --server
if errorlevel 1 (
  echo.
  echo Xavfsizlik tekshiruvi o'tmadi: yuqoridagi XATO qatorlarini tuzating va qayta ishga tushiring.
  pause
  exit /b 1
)

sc query cloudflared 2>nul | findstr /C:"RUNNING" >nul
if errorlevel 1 (
  echo.
  echo DIQQAT: cloudflared xizmati ishlamayapti: sayt shu kompyuterda ochiladi, lekin internetdan emas.
  echo   O'rnatilmagan bo'lsa: Cloudflare Zero Trust -^> Networks -^> Tunnels dagi buyruqni administrator
  echo   PowerShell'da bajaring. O'rnatilgan bo'lsa: administrator cmd'da  sc start cloudflared
  echo.
)

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
start "SI Stilist sayt" cmd /k ""%ROOT%scripts\qayta.bat" npm start -- -H 127.0.0.1"
start "" cmd /c "timeout /t 20 /nobreak >nul & start http://127.0.0.1:3000/admin/holat"

echo.
echo Hammasi ishga tushdi.
echo   Internetda:       https://sistilist.uz   (jonli oyna: /oyna, panel: /panel)
echo   Shu kompyuterda:  http://127.0.0.1:3000
echo Muhim: kompyuter uyquga ketsa sayt to'xtaydi. Quvvatga ulanganda uyquni o'chirish:
echo   powercfg /change standby-timeout-ac 0
pause
