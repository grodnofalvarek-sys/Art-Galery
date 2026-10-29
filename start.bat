@echo off
chcp 65001 > nul
cd /d "%~dp0"
title 3D Art Gallery

echo ===================================================
echo     Запуск 3D Арт-Галереи...
echo ===================================================

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден в системе.
    echo Пожалуйста, установите Node.js с сайта https://nodejs.org/
    echo или откройте gallery.html в браузере вручную.
    echo ===================================================
    pause
    exit /b 1
)

node server.js

if %errorlevel% neq 0 (
    echo.
    echo [!] Сервер был остановлен с ошибкой.
    pause
)
