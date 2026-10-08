@echo off
rem qayta.bat <buyruq...>: buyruq to'xtasa (xato yoki yopilish) 5 soniyadan keyin uni qayta ishga tushiradi.
rem run-all.bat har bir qismni (sayt, SI server, ngrok) shu bilan alohida oynada ishlatadi.
rem To'xtatish: shu oynani yoping.
:loop
call %*
echo.
echo [%date% %time%] To'xtadi. 5 soniyadan keyin qayta ishga tushadi (butunlay to'xtatish: oynani yoping)
timeout /t 5 /nobreak >nul
goto loop
