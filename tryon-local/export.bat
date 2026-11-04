@echo off
rem Jonli oyna modelini telefon uchun ONNX'ga o'tkazish (2-bosqich sinovi). Natija: models\web\mirror\sinov
rem   export.bat                                namuna rasmsiz (faqat tezlik o'lchanadi)
rem   export.bat --namuna odam.jpg kiyim.jpg    telefonda natijani kompyuterdagi bilan solishtirish uchun
rem   export.bat --nom v1                       doimiy versiya (bir yil keshlanadi)
rem Keyin telefonda: https://sistilist.uz/oyna/sinov  (yoki ?nom=v1)
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  echo Avval setup.bat ni ishga tushiring.
  pause
  exit /b 1
)
.venv\Scripts\python -c "import onnx, onnxruntime" 2>nul
if errorlevel 1 (
  echo onnx va onnxruntime o'rnatilmoqda...
  .venv\Scripts\python -m pip install -q onnx==1.17.0 onnxruntime==1.20.1 || goto :error
)
.venv\Scripts\python export_onnx.py %* || goto :error
pause
exit /b 0
:error
echo Xato: yuqoridagi xabarni o'qing.
pause
exit /b 1
