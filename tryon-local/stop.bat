@echo off
rem 8001-portni egallab turgan eski lokal kiyintirish serverini to'xtatadi
set "FOUND="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
  echo Server to'xtatilmoqda, PID %%a
  taskkill /PID %%a /F >nul
  set "FOUND=1"
)
if not defined FOUND echo 8001-portda ishlayotgan server yo'q.
