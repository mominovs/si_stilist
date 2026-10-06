@echo off
rem Demo uchun hammasini ishga tushirish: lokal kiyintirish serveri, sayt va brauzer oynalari.
rem Birinchi marta: npm run setup va tryon-local\setup.bat bajarilgan bo'lsin.
cd /d %~dp0
if exist tryon-local\.venv\Scripts\python.exe (
  start "SI kiyintirish serveri" cmd /k tryon-local\start.bat
) else (
  echo Lokal kiyintirish o'rnatilmagan: tryon-local\setup.bat. Kiyintirish demo rejimda ishlaydi.
)
rem Sayt kompilyatsiya qilinguncha kutib, keyin holat, panel va xaridor ekranini ochadi
start "" cmd /c "timeout /t 15 /nobreak >nul & start http://localhost:3000/admin/holat & start http://localhost:3000/panel & start http://localhost:3000/"
npm run dev
