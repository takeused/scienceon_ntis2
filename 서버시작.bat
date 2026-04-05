@echo off
chcp 65001 >nul
title ScienceON 통합검색

echo.
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo    ScienceON 통합검색 시작 중...
echo    잠시 후 브라우저가 자동으로 열립니다.
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

:: Node.js 설치 확인
where node >nul 2>&1
if errorlevel 1 (
    echo  [오류] Node.js가 설치되어 있지 않습니다.
    echo  https://nodejs.org 에서 설치 후 다시 실행하세요.
    pause
    exit /b 1
)

:: 서버 실행 (브라우저 자동 오픈 포함)
node "%~dp0proxy-server.js"

echo.
echo  서버가 종료되었습니다.
pause
