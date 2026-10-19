@echo off
rem FLUX 3 Image Klein sinovi uchun ALOHIDA muhit (.venv-flux). Asosiy server muhiti (.venv) o'zgarmaydi:
rem FLUX 3 uchun torch 2.6+ va diffusers'ning yangi (dev) versiyasi kerak, CatVTON esa torch 2.4 da ishlaydi.
cd /d %~dp0

set "PY="
for %%V in (3.11 3.10 3.12) do (
  if not defined PY (
    py -%%V -c "import sys" >nul 2>&1 && set "PY=py -%%V"
  )
)
if not defined PY (
  python -c "import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,12) else 1)" >nul 2>&1 && set "PY=python"
)
if not defined PY (
  echo XATO: Python 3.10-3.12 topilmadi. setup.bat dagi ko'rsatmaga qarang.
  exit /b 1
)

if not exist .venv-flux\Scripts\python.exe (
  echo [1/3] .venv-flux yaratilmoqda...
  %PY% -m venv .venv-flux || goto :error
)
set "VPY=%~dp0.venv-flux\Scripts\python.exe"
"%VPY%" -m pip install --upgrade pip

echo [2/3] PyTorch 2.7 (CUDA 12.6) o'rnatilmoqda, ~2.5 GB...
"%VPY%" -m pip install torch==2.7.1 torchvision==0.22.1 --index-url https://download.pytorch.org/whl/cu126 || goto :error

echo [3/3] diffusers (FLUX 3 qo'llab-quvvatlanadigan versiya) va boshqalar...
"%VPY%" -m pip install "diffusers @ git+https://github.com/huggingface/diffusers@b800f828f3951c4d206e154411bcbfa693cd322e" "transformers>=5.0,<6" "accelerate>=1.0" "huggingface_hub>=1.32,<3" "safetensors>=0.8" gguf bitsandbytes pillow numpy || goto :error

"%VPY%" -c "import torch, diffusers, transformers; print('CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '', '| diffusers', diffusers.__version__, '| transformers', transformers.__version__)"
echo.
echo Tayyor. Model Hugging Face'dan yuklanadi (birinchi ishga tushirishda ~13 GB). Agar model yopiq bo'lsa:
echo   1) https://huggingface.co/black-forest-labs/flux-3-image-klein sahifasida litsenziyani qabul qiling
echo   2) https://huggingface.co/settings/tokens dan "Read" token oling
echo   3) .venv-flux\Scripts\hf auth login   (tokenni joylang)
echo Keyin: flux_sinov.bat
exit /b 0

:error
echo XATO yuz berdi. Yuqoridagi xabarni tekshiring (git o'rnatilgan bo'lishi kerak).
exit /b 1
