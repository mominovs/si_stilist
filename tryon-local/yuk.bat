@echo off
rem Jonli oyna yuk sinovi: bir vaqtda 1, 2, 4, 6, 8 xaridor (server ishlab turgan bo'lishi kerak: start.bat yoki run-*.bat)
rem   yuk.bat --rasm C:\...\surat.jpg                 (beligacha yoki to'liq, old tomondan suratingiz)
rem   yuk.bat --video C:\...\video.mp4 --odamlar 1,3,6 (harakatli video: haqiqiyroq)
rem   yuk.bat --rasm C:\...\surat.jpg --kenglik 400    (internet orqali kadr o'lchami)
set "YUK_CWD=%CD%"
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  echo Avval setup.bat ni ishga tushiring.
  pause
  exit /b 1
)
pushd "%YUK_CWD%"
"%~dp0.venv\Scripts\python.exe" "%~dp0yuk_sinovi.py" %*
popd
pause
