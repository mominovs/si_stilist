@echo off
rem Kunlik tartib (Vazifalar rejalashtiruvchisiga qo'yish uchun): kunlik.bat [rasm soni] [o'qitish soati]
rem   1) generate_dataset.py kunlik: yangi rasmlar (standart 60 ta)
rem   2) kechasi.bat <soat> oyna: tekshiruv (prep) va jonli oynani o'qitish (standart 6 soat)
rem Ertalab: runs\kechasi.log, dataset\hisobot.jpg, runs\old\ namunalari. Keyin start.bat (yoki run-local.bat)
cd /d %~dp0
set "RASM=%~1"
if "%RASM%"=="" set "RASM=60"
set "SOAT=%~2"
if "%SOAT%"=="" set "SOAT=6"
if not exist runs mkdir runs
echo ==== %date% %time%: kunlik, %RASM% rasm ==== >> runs\generatsiya.log
call generate.bat kunlik --limit %RASM% >> runs\generatsiya.log 2>&1
call kechasi.bat %SOAT% oyna
