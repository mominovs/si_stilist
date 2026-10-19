@echo off
rem FLUX 3 Image Klein va hozirgi CatVTON'ni bir xil rasmlarda solishtirish (sayt va server o'zgarmaydi).
rem Avval bir marta setup_flux.bat. Misol: flux_sinov.bat   yoki   flux_sinov.bat --qadam 8 --odamlar o01,o10
rem Natija: runs\flux3\taqqoslash.jpg (odam | kiyim | CatVTON | FLUX 3 | Gemini namunasi), runs\flux3\natija.txt
cd /d %~dp0
if not exist .venv-flux\Scripts\python.exe (
  echo .venv-flux topilmadi. Avval setup_flux.bat ni ishga tushiring.
  exit /b 1
)
set PYTHONIOENCODING=utf-8
set PYTHONUNBUFFERED=1

echo [1/3] CatVTON natijalari (start.bat bilan server ishlab tursa)...
.venv-flux\Scripts\python.exe flux_sinov.py --bosqich catvton %*

echo [2/3] GPU bo'shatilmoqda: server to'xtatiladi...
call stop.bat

echo [3/3] FLUX 3 Image Klein (birinchi marta ~13 GB yuklanadi)...
.venv-flux\Scripts\python.exe flux_sinov.py --bosqich flux %*

echo.
echo Natija: runs\flux3\taqqoslash.jpg va runs\flux3\natija.txt. Serverni qayta yoqish: start.bat
