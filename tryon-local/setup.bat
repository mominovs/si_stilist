@echo off
rem SI Stilist lokal kiyintirish serverini o'rnatish (Windows, NVIDIA GPU)
rem PyTorch 2.4 va kutubxonalar Python 3.10-3.12 ni talab qiladi (3.13+ ishlamaydi)
cd /d %~dp0

rem --- Mos Python'ni topish: avval py launcher orqali 3.11, 3.10, 3.12, keyin oddiy python ---
set "PY="
for %%V in (3.11 3.10 3.12) do (
  if not defined PY (
    py -%%V -c "import sys" >nul 2>&1 && set "PY=py -%%V"
  )
)
if not defined PY (
  python -c "import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,12) else 1)" >nul 2>&1 && set "PY=python"
)
if not defined PY goto :nopython
echo Python: %PY%
%PY% --version

if not exist CatVTON (
  echo [1/4] CatVTON yuklab olinmoqda...
  git clone https://github.com/Zheng-Chong/CatVTON.git || goto :error
  git -C CatVTON checkout 7818397f25613beedb3d861a34769f607cfcf3b1 || goto :error
)

rem --- Eski .venv boshqa Python versiyasi bilan yaratilgan bo'lsa, qayta yaratiladi ---
if exist .venv\Scripts\python.exe (
  .venv\Scripts\python.exe -c "import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,12) else 1)" >nul 2>&1 || (
    echo Eski .venv mos bo'lmagan Python bilan yaratilgan, o'chirilmoqda...
    rmdir /s /q .venv
  )
)
if not exist .venv\Scripts\python.exe (
  echo [2/4] Python muhiti yaratilmoqda...
  if exist .venv rmdir /s /q .venv
  %PY% -m venv .venv || goto :error
)
set "VPY=%~dp0.venv\Scripts\python.exe"

echo [3/4] PyTorch (CUDA 12.1) o'rnatilmoqda, ~2.5 GB...
"%VPY%" -m pip install --upgrade pip
"%VPY%" -m pip install torch==2.4.0 torchvision==0.19.0 --index-url https://download.pytorch.org/whl/cu121 || goto :error

echo [4/4] Qolgan kutubxonalar...
"%VPY%" -m pip install -r requirements.txt || goto :error

"%VPY%" -c "import torch; print('CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
echo.
echo Tayyor. Serverni ishga tushirish: start.bat
exit /b 0

:nopython
echo.
echo XATO: Python 3.10, 3.11 yoki 3.12 topilmadi (PyTorch 2.4 Python 3.13+ da ishlamaydi).
echo Python 3.11 ni o'rnating: https://www.python.org/downloads/release/python-3119/
echo   - "Windows installer (64-bit)" ni yuklab oling
echo   - o'rnatishda "py launcher" belgilangan bo'lsin (yangi Python'ingiz ham o'z joyida qoladi)
echo Keyin yangi oynada setup.bat ni qayta ishga tushiring.
exit /b 1

:error
echo XATO yuz berdi. Yuqoridagi xabarni tekshiring.
exit /b 1
