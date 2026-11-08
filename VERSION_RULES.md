# [🚨 절대 망각 금지] ADS 버전 관리, 보안 서명 및 배포 표준 규정 (VERSION_RULES.md)

> [!CAUTION]
> **AI 에이전트 및 개발자 필수 절대 준수 4대 철칙 (절대 까먹지 말 것!)**
> 1. **작업 전 폴더 복사 필수**: 코드 수정이나 작업을 시작하기 전에 기존 최신 버전 폴더를 복사하여 **새로운 버전 폴더(`VX.Y.Z`)를 먼저 생성**하고 그 안에서 작업해야 합니다. 이전 버전 폴더는 절대 직접 수정하지 않고 영구 보존합니다.
> 2. **3단계 버전 관리 및 폴더명 엄수**: 폴더명과 버전 표기는 반드시 **`VX.Y.Z` (대문자 V + Major.Minor.Patch)** 3단계 체계를 엄격히 준수합니다 (예: `V1.0.0`, `V1.0.1`, `V1.1.0`).
> 3. **Microsoft Authenticode 디지털 코드서명 필수 주입**: 앱 본체(`dist\MY_PDF.exe`)와 인스톨러(`MY_PDF_Setup.exe`) 빌드 시 반드시 `signtool.exe`와 `ADS_CodeSign_Private.pfx`를 사용하여 Windows 스마트 앱 컨트롤(SAC) 통과용 디지털 서명을 주입해야 합니다.
> 4. **Setups 폴더 사본 복사 필수**: 최종 설치 프로그램(`MY_PDF_Setup.exe`)을 빌드 및 서명한 직후, **반드시 `D:\coding\Utility\office\Setups\MY_PDF_Setup.exe`에 사본을 복사**하여 항상 최신 인스톨러가 유지되도록 해야 합니다. (보조 경로 `C:\dev_app\office\Setups\` 존재 시 동시 복사)

---

## 1. 3단계 버전 체계 및 버전업 원칙

> 🚀 **[사용자 명시적 특별 지침 (2026-11-08 개정)]**:  
> 기존의 'V1.0.0' 고정 유지 지침이 공식 해제되었습니다.  
> 향후 모든 기능 개선 및 버그 수정 작업 시 작업 단위(Major/Minor/Patch)에 따라 새로운 버전 폴더(`VX.Y.Z`)를 생성하고, 인스톨러(`setup.iss`), 파일 메타데이터, 앱 환경설정 타이틀/하단 표기 모두 신규 버전에 맞추어 정상 판올림 및 동기화합니다.

모든 배포 및 업데이트는 **`Major.Minor.Patch` (`VX.Y.Z`)** 3단계를 준수합니다.

| 단위 | 구분 | 판올림 기준 | 예시 |
| :--- | :---: | :--- | :--- |
| **Major (X)** | 주 버전 | 아키텍처 전면 개편, 하위 호환이 불가능한 핵심 로직 변경 | `V1.0.0` → `V2.0.0` |
| **Minor (Y)** | 부 버전 | 사용자를 위한 새로운 기능 추가, UI/설정 체계 대규모 개편 | `V1.0.0` → `V1.1.0` |
| **Patch (Z)** | 수선 버전 | 사용자 관점의 동작 버그 수정, 딜레이 최적화, 포커스/단축키 보정 | `V1.0.0` → `V1.0.1` |

---

## 2. 작업 시 표준 6단계 워크플로우 (절대 준수)

에이전트는 사용자 요청을 처리할 때 반드시 아래 **6단계 순서**를 따릅니다:

1. **[1단계] 최신 버전 확인**
   - 루트의 버전 폴더 목록(`VX.Y.Z`)을 조회하여 현재 가장 최신 버전 번호를 확인합니다. (현재 기준: **`V1.0.0`**)
2. **[2단계] 신규 버전 폴더 생성 및 복사**
   - 최신 버전 폴더를 복사하여 다음 버전 폴더(예: `V1.0.1`)를 먼저 생성합니다.
3. **[3단계] 소스코드 및 리소스 수정**
   - 요청된 요구사항(기능 개선, 버그 수정, 레이아웃 변경 등)을 반영합니다.
   - 주의: 온라인 웹/PWA 파일(`pixpdf.html`, `index.html`, `sw.js`)에는 MY Apps 보안인증서 코드를 절대 넣지 않으며, 데스크톱 래퍼(`src-desktop\Program.cs`)에만 `AdsCertChecker.CheckLicense()`를 유지합니다.
4. **[4단계] 컴파일 및 사내 보안인증서(SAC) 전자서명**
   - Release 빌드 후 `signtool.exe`와 `ADS_CodeSign_Private.pfx` (`ads1234!`)를 사용하여 `dist\MY_PDF.exe` 바이너리를 전자서명합니다.
5. **[5단계] 인스톨러 빌드 및 전자서명**
   - Inno Setup(`ISCC.exe setup.iss`)을 실행하여 단일 설치 파일(`MY_PDF_Setup.exe`) 생성 후 `signtool.exe`로 전자서명을 완료합니다. (`build_installer.bat` 실행 시 4~6단계 자동 수행)
6. **[6단계] 신규 버전 폴더, 루트(PWA) 및 배포 폴더(`Setups`) 최종 동기화**
   - 신규 버전 폴더(`VX.Y.Z/`)와 프로젝트 루트에 최종 수정 파일들과 생성된 `MY_PDF_Setup.exe`를 완전 동기화합니다.
   - 외부 배포 폴더로 최종 복사:
     - `D:\coding\Utility\office\Setups\MY_PDF_Setup.exe`
     - `C:\dev_app\office\Setups\MY_PDF_Setup.exe` (존재할 경우)

---

## 3. 버전별 폴더 내 필수 포함 파일 목록 (온전한 독립 스냅샷 보존)

신규 버전 폴더(`VX.Y.Z/`)에는 해당 버전의 독립적인 스냅샷이 온전히 보존되어야 합니다:
- `pixpdf.html`, `index.html`, `sw.js`, `manifest.json` (웹/PWA 및 로컬 하이브리드 엔진 코어)
- `libs/` (오프라인 로컬 UMD 라이브러리 일체)
- `src-desktop/` (`Program.cs`, `AdsCertChecker.cs`, `MY_PDF.csproj` 데스크톱 WebView2 래퍼 소스)
- `dist/` (서명된 `MY_PDF.exe`, `WebView2Loader.dll` 및 패키징 페이로드)
- `setup.iss`, `LICENSE.txt`, `build_installer.bat` (인스톨러 빌드 및 자동 서명 스크립트)
- `favicon.ico`, `miryang_bi.png` 및 파비콘/PWA 아이콘 세트
- `MY_PDF_Setup.exe` (Microsoft Authenticode 디지털 코드서명 완료된 최종 인스톨러)
- `CHANGELOG.md`, `FEATURE_REGISTRY.md`, `VERSION_RULES.md`

---

## 4. 시스템 배포 및 보안 인증 표준 프로필

- **공식 앱 명칭**: `MY PDF` (온라인 웹/PWA 호환 명칭: `MY PDF / PixPDF`)
- **앱 설명**: `PDF & 이미지 상호 변환기`
- **실행 파일명**: `MY_PDF.exe`
- **설치 프로그램명**: `MY_PDF_Setup.exe`
- **기본 설치 경로**: `C:\Program Files\MY_ADS\MY_PDF` (`{autopf}\MY_ADS\MY_PDF`)
- **게시자 (Publisher)**: `ADS`
- **디지털 서명 인증서**: `D:\coding\Utility\office\ADS Software\ADS_CodeSign_Private.pfx` (암호: `ads1234!`, 타임스탬프: `http://timestamp.digicert.com`)
- **사내 라이선스 검증**: `C:\Program Files\MY_ADS\.ads_cert` (`AdsCertChecker.CheckLicense()`)
- **온라인 배포 주소**: `https://SunnyAn2357.github.io/PixPDF/` (`origin`: `https://github.com/SunnyAn2357/PixPDF.git`)

---

## 5. 버전 히스토리 (Release History)

### [V1.0.0] - 2026-11-08 (정식 출시 마스터 베이스라인 수립)
- **프로젝트 구조 대청소 및 정식 `V1.0.0` 리셋**:
  - 과거 개발 과정의 91개 구버전 폴더(`V2.13.4` ~ `V2.75.6`) 및 임시 파일/문서를 `Backups/` 디렉터리로 안전하게 아카이빙.
  - 루트 디렉터리 슬림화 및 마크다운 문서 표준 체계 확립.
- **2중 보안 인증(AdsCertChecker + Microsoft Authenticode 디지털 코드서명) 자동 빌드 파이프라인 완비**:
  - `src-desktop\Program.cs` 진입점에 사내 1년 주기 인증서 검사(`AdsCertChecker.CheckLicense()`) 탑재 (온라인 웹/PWA 소스는 100% 순수 클라이언트 로직 격리 유지).
  - `build_installer.bat` 내 `signtool.exe` 자동 서명 단계를 내장하여 `dist\MY_PDF.exe` 본체 및 `MY_PDF_Setup.exe` 인스톨러 양쪽 모두에 SAC 통과용 디지털 서명 자동 주입.
  - `V1.0.0` 스냅샷 생성 및 `Setups` 배포 폴더 최신 동기화 완료.
