@echo off
chcp 65001 > nul
echo ===================================================
echo   PixPDF 원클릭 자동 번들러 (단일 파일 생성기)
echo ===================================================
powershell -ExecutionPolicy Bypass -File "%~dp0build.ps1"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [성공] 오프라인 단일 파일(pixpdf.html)이 생성되었습니다!
) else (
    echo.
    echo [오류] 빌드 중 문제가 발생했습니다.
)
timeout /t 3 > nul
