@echo off
rem Rasmli rejim modelini (CatVTON) o'z suratlaringiz bilan o'qitish. Misol: train_photo.bat --steps 1500
rem Avval prep.bat. Server ishlab turgan bo'lsa GPU xotirasi yetmaydi: avval stop.bat
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  echo .venv topilmadi. Avval setup.bat ni ishga tushiring.
  exit /b 1
)
.venv\Scripts\python.exe train_photo.py %*
