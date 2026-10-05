@echo off
rem SI Stilist lokal kiyintirish serverini o'rnatish (Windows, NVIDIA GPU)
cd /d %~dp0

if not exist CatVTON (
  echo [1/4] CatVTON yuklab olinmoqda...
  git clone https://github.com/Zheng-Chong/CatVTON.git || goto :error
  git -C CatVTON checkout 7818397f25613beedb3d861a34769f607cfcf3b1 || goto :error
)

if not exist .venv (
  echo [2/4] Python muhiti yaratilmoqda...
  python -m venv .venv || goto :error
)
call .venv\Scripts\activate.bat

echo [3/4] PyTorch (CUDA 12.1) o'rnatilmoqda, ~2.5 GB...
python -m pip install --upgrade pip
pip install torch==2.4.0 torchvision==0.19.0 --index-url https://download.pytorch.org/whl/cu121 || goto :error

echo [4/4] Qolgan kutubxonalar...
pip install -r requirements.txt || goto :error

python -c "import torch; print('CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
echo.
echo Tayyor. Serverni ishga tushirish: start.bat
exit /b 0

:error
echo XATO yuz berdi. Yuqoridagi xabarni tekshiring.
exit /b 1
