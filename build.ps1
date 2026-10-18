# ==============================================================================
# PixPDF 자동 번들러 (build.ps1)
# - src/ 폴더의 분리된 CSS 및 JS 모듈들을 하나의 완전 무결한 단일 HTML 파일로 자동 병합
# - 100% 로컬 오프라인 구동(file://) 및 PWA 웹 호스팅 동시 지원
# ==============================================================================

param (
    [string]$TargetVersion = "V2.10.0"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "🔨 [PixPDF] 빌드 시작 (대상 버전: $TargetVersion)..." -ForegroundColor Cyan

$templatePath = Join-Path $root "src\template.html"
$cssPath      = Join-Path $root "src\css\style.css"
$jsDir        = Join-Path $root "src\js"

if (-not (Test-Path $templatePath)) { throw "src/template.html 파일을 찾을 수 없습니다." }
if (-not (Test-Path $cssPath))      { throw "src/css/style.css 파일을 찾을 수 없습니다." }
if (-not (Test-Path $jsDir))        { throw "src/js 폴더를 찾을 수 없습니다." }

# 1. 템플릿 및 CSS 읽기
$template = [System.IO.File]::ReadAllText($templatePath, [System.Text.Encoding]::UTF8)
$css      = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)

# 2. JS 모듈 파일 번호 순 정렬 및 병합
$jsFiles = Get-ChildItem -Path $jsDir -Filter "*.js" | Sort-Object Name
$jsBuilder = New-Object System.Text.StringBuilder

foreach ($file in $jsFiles) {
    Write-Host "  -> [모듈 결합] $($file.Name)" -ForegroundColor DarkGray
    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    [void]$jsBuilder.AppendLine("`n    // ==========================================================================")
    [void]$jsBuilder.AppendLine("    // [MODULE] $($file.Name)")
    [void]$jsBuilder.AppendLine("    // ==========================================================================`n")
    [void]$jsBuilder.AppendLine($content)
}

$jsCombined = $jsBuilder.ToString()

# 3. 템플릿에 CSS 및 JS 주입
$bundle = $template.Replace("/* CSS_INJECTION_POINT */", "`n" + $css + "`n  ")
$bundle = $bundle.Replace("/* JS_INJECTION_POINT */", $jsCombined)

# 4. 대상 버전 폴더 및 루트 배포 파일 생성
$targetDir = Join-Path $root $TargetVersion
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

$targetIndex  = Join-Path $targetDir "index.html"
$targetPixpdf = Join-Path $targetDir "pixpdf.html"
$rootPixpdf   = Join-Path $root "pixpdf.html"

[System.IO.File]::WriteAllText($targetIndex, $bundle, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($targetPixpdf, $bundle, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($rootPixpdf, $bundle, [System.Text.Encoding]::UTF8)

# 5. Service Worker 캐시 이름 동기화 (TargetVersion 기준)
$swPath = Join-Path $targetDir "sw.js"
if (Test-Path $swPath) {
    $swContent = [System.IO.File]::ReadAllText($swPath, [System.Text.Encoding]::UTF8)
    $versionLower = $TargetVersion.ToLower()
    $newCacheName = "pixpdf-cache-$versionLower"
    $swContent = [System.Text.RegularExpressions.Regex]::Replace($swContent, "const CACHE_NAME = 'pixpdf-cache-[^']+';", "const CACHE_NAME = '$newCacheName';")
    [System.IO.File]::WriteAllText($swPath, $swContent, [System.Text.Encoding]::UTF8)
    Write-Host "  -> [SW 캐시 갱신] $newCacheName" -ForegroundColor DarkGray
}

Write-Host "✨ [PixPDF] 빌드 완료!" -ForegroundColor Green
Write-Host "   📄 오프라인 단일 파일: $targetPixpdf" -ForegroundColor Yellow
Write-Host "   🌐 온라인 PWA 파일:   $targetIndex" -ForegroundColor Yellow
Write-Host "   📦 루트 실행 파일:     $rootPixpdf" -ForegroundColor Yellow
