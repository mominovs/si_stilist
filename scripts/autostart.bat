@echo off
rem run-server.bat ni Windows'ga kirilganda avtomatik ishga tushirish (Vazifalar rejalashtiruvchisi).
rem   scripts\autostart.bat          yoqish (administrator sifatida ishga tushiring)
rem   scripts\autostart.bat o'chir   o'chirish
rem Elektr o'chib qaytganda kompyuter o'zi yonishi uchun BIOS'da "Restore on AC Power Loss" = Power On,
rem Windows'ga parolsiz kirish yoki avtomatik kirish (netplwiz) ham kerak bo'ladi.
set TASK=SI Stilist server
if /I "%~1"=="o'chir" (
  schtasks /Delete /TN "%TASK%" /F
  pause
  exit /b
)
schtasks /Create /TN "%TASK%" /SC ONLOGON /RL HIGHEST /F /TR "cmd /c \"%~dp0..\run-server.bat\""
if errorlevel 1 (
  echo Yaratib bo'lmadi: faylni o'ng tugma -^> "Run as administrator" bilan oching.
) else (
  echo Tayyor: Windows'ga kirilganda run-server.bat o'zi ishga tushadi. O'chirish: scripts\autostart.bat o'chir
)
pause
