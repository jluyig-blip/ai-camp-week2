@echo off
cd /d "C:\Users\정기열\고객문의-자동응답"
timeout /t 5 /nobreak
"C:\Users\정기열\AppData\Roaming\npm\pm2.cmd" resurrect
