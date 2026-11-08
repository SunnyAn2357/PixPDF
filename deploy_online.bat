@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ========================================================
echo   MY PDF (PixPDF) - 온라인 원클릭 배포 도구
echo   GitHub Pages (https://SunnyAn2357.github.io/PixPDF/)
echo ========================================================
echo.

echo [1/3] Git 저장소 상태 확인...
git status --short
echo.

echo --------------------------------------------------------
echo   배포 작업을 진행하시겠습니까?
echo   [1] 최신 온라인 버전 GitHub 배포 (git add + commit + push) [기본값]
echo   [2] 취소 및 종료
echo --------------------------------------------------------
set /p "CHOICE=선택 (1/2, 기본: 1): "
if "%CHOICE%"=="" set "CHOICE=1"
if not "%CHOICE%"=="1" (
    echo [OK] 배포가 취소되었습니다.
    goto :Done
)

echo.
echo [2/3] 온라인 배포용 파일 스테이징 및 커밋...
git add -A

:: 변경 사항이 있는지 확인
git diff --cached --quiet
if not errorlevel 1 (
    echo [INFO] 커밋할 변경 사항이 없습니다. 최신 상태입니다.
    goto :PushOnly
)

:: 커밋 메시지 생성
for /f "tokens=1-3 delims=-/. " %%a in ("%date%") do set "D_STR=%%a-%%b-%%c"
set "TIME_STR=%time: =0%"
set "T_STR=%TIME_STR:~0,2%:%TIME_STR:~3,2%"
set "COMMIT_MSG=Deploy: 온라인 최신 버전 동기화 (%D_STR% %T_STR%)"

git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo [ERROR] Git 커밋 실패.
    pause
    exit /b 1
)

:PushOnly
echo.
echo [3/3] 원격 저장소 (origin main) 푸시 중...
git push origin main
if errorlevel 1 (
    echo.
    echo [WARNING] GitHub 푸시 실패. 인터넷 연결 또는 인증 상태를 확인하십시오.
) else (
    echo.
    echo [OK] GitHub 푸시 성공! (온라인 배포 완료)
    echo       온라인 주소: https://SunnyAn2357.github.io/PixPDF/
)

:Done
echo.
echo ========================================================
echo   온라인 배포 처리가 완료되었습니다.
echo ========================================================
pause
