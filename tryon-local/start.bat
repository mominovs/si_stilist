@echo off
rem Lokal kiyintirish serveri: http://127.0.0.1:8001  (qo'shimcha parametrlar: start.bat --height 640 --width 480)
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  echo .venv topilmadi. Avval setup.bat ni ishga tushiring.
  exit /b 1
)
.venv\Scripts\python.exe server.py %*
