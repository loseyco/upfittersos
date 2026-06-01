@echo off
title UpfittersOS - Git Push
color 0A
echo.
echo ====================================================
echo      Staging, Committing and Pushing to Git 
echo ====================================================
echo.
set /p commit_msg="Enter commit message: "
if "%commit_msg%"=="" (
    echo Error: Commit message cannot be empty.
    pause
    exit /b
)
git add .
git commit -m "%commit_msg%"
git push
echo.
echo Done!
pause
