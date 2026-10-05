@echo off
rem Lokal kiyintirish serveri: http://127.0.0.1:8001  (qo'shimcha parametrlar: start.bat --height 640 --width 480)
cd /d %~dp0
call .venv\Scripts\activate.bat
python server.py %*
