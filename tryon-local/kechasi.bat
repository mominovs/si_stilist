@echo off
rem Kechasi o'qitish: kechasi.bat 8   (soat, standart 8). Vaqtning 70% rasmli rejim, 30% jonli oyna.
rem Ketma-ket: server to'xtatiladi -> prep (rasmlar tekshiriladi) -> train_photo -> train_mirror.
rem Hammasi runs\kechasi.log ga yoziladi. Ertalab: shu faylning oxiri, runs\photo\ va runs\old\ rasmlari.
rem Modellar faqat tekshiruv odamida yaxshilansa saqlanadi: yomonlashsa eski model qoladi.
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  echo .venv topilmadi. Avval setup.bat ni ishga tushiring.
  exit /b 1
)
set "SOAT=%~1"
if "%SOAT%"=="" set "SOAT=8"
set /a JAMI=%SOAT%*60
set /a RASM=%JAMI%*7/10
set /a OYNA=%JAMI%-%RASM%
set PYTHONUNBUFFERED=1
set PYTHONIOENCODING=utf-8
if not exist runs mkdir runs
set "LOG=runs\kechasi.log"

echo ==== %date% %time%: kechasi o'qitish boshlandi, %SOAT% soat ==== >> "%LOG%"
echo Kechasi o'qitish: %SOAT% soat. Jarayon: %LOG% (Notepad bilan ochsa bo'ladi)
echo Kompyuterni zaryadga ulang va yopmang. Bu oyna ochiq tursin.
call stop.bat >> "%LOG%" 2>&1

echo [1/3] Rasmlar tekshirilmoqda (prep)...
.venv\Scripts\python.exe dataset_prep.py >> "%LOG%" 2>&1
if errorlevel 1 (
  echo XATO: rasmlarni tayyorlab bo'lmadi. %LOG% oxirini o'qing.
  exit /b 1
)

echo [2/3] Rasmli rejim o'qitilmoqda: %RASM% daqiqa, 768x576...
.venv\Scripts\python.exe train_photo.py --daqiqa %RASM% --height 768 --width 576 --every 500 >> "%LOG%" 2>&1
if errorlevel 3 (
  echo GPU xotirasi yetmadi: 512x384 da qayta boshlanadi
  echo ---- GPU xotirasi yetmadi: 512x384 da qayta ---- >> "%LOG%"
  .venv\Scripts\python.exe train_photo.py --daqiqa %RASM% --every 500 >> "%LOG%" 2>&1
)

echo [3/3] Jonli oyna o'qitilmoqda: %OYNA% daqiqa...
.venv\Scripts\python.exe train_mirror.py --view hammasi --daqiqa %OYNA% --every 1000 >> "%LOG%" 2>&1

echo ==== %date% %time%: tugadi ==== >> "%LOG%"
echo Tugadi. Natija: %LOG%, namunalar: runs\photo va runs\old. Keyin start.bat
