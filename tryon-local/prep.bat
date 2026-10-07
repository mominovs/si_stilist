@echo off
rem Jonli oyna o'qitish to'plamini tekshirish va tayyorlash: dataset\hisobot.txt, dataset\hisobot.jpg
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  echo .venv topilmadi. Avval setup.bat ni ishga tushiring.
  exit /b 1
)
.venv\Scripts\python.exe dataset_prep.py %*
