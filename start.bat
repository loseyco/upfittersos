@echo off
title UpfittersOS V2
color 0B
echo.
echo ====================================================
echo      Starting UpfittersOS V2 Dev Server 
echo      Port: 4010 (Isolated Instance)
echo ====================================================
echo.
cd apps\web
npm run dev
pause
