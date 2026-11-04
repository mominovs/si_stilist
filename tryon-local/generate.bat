@echo off
rem O'qitish rasmlarini OpenAI rasm generatori bilan yig'ish. Misollar:
rem   generate.bat katalog              do'kon kiyimlarini dataset\kiyimlar ga
rem   generate.bat odam --soni 2        2 ta yangi sun'iy odam
rem   generate.bat kiyintir --limit 20  yetishmagan rasmlar (har biri bitta API so'rovi)
rem   generate.bat kunlik --limit 60    kunlik tartib
rem   generate.bat holat
rem Kalit: loyiha ildizidagi .env da OPENAI_API_KEY=...
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  echo .venv topilmadi. Avval setup.bat ni ishga tushiring.
  exit /b 1
)
.venv\Scripts\python.exe -c "import openai" 2>nul || .venv\Scripts\python.exe -m pip install -q "openai>=2"
set PYTHONIOENCODING=utf-8
.venv\Scripts\python.exe generate_dataset.py %*
