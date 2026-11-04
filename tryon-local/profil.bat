@echo off
rem Jonli oyna kadrining har bosqichi qancha vaqt oladi (avval serverni yoping: stop.bat yoki oynalarni yopish)
rem   profil.bat --rasm C:\...\surat.jpg
set "PROFIL_CWD=%CD%"
cd /d %~dp0
pushd "%PROFIL_CWD%"
"%~dp0.venv\Scripts\python.exe" "%~dp0profil.py" %*
popd
pause
