@echo off
rem Jonli oyna modelini orqa/yon ko'rinish uchun o'qitish. Misol: train.bat --view orqa --steps 3000
rem Avval prep.bat. Server ishlab turgan bo'lsa, GPU xotirasi yetmasligi mumkin: avval stop.bat
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  echo .venv topilmadi. Avval setup.bat ni ishga tushiring.
  exit /b 1
)
.venv\Scripts\python.exe train_mirror.py %*
