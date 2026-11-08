# CHANGELOG - MY PDF (PixPDF)

모든 주요 변경 사항과 릴리스 이력을 기록합니다. (과거 베타 개발 이력 `V2.13.4` ~ `V2.75.6` 상세 로그는 `Backups/versions/` 내 각 폴더에 영구 보존되어 있습니다.)

---

## [V1.0.0] - 2026-11-08 (정식 출시 마스터 릴리스)

### 🚀 정식 출시(`V1.0.0`) 리셋 및 프로젝트 구조 표준화
- **폴더 대청소 및 아카이빙 (`Backups/`)**:
  - 출시 전 개발 과정에서 누적된 91개 구버전 폴더(`V2.13.4` ~ `V2.75.6`), 임시 빌드 폴더(`build/`, `payload/`, `installer_source/` 등), 중복 마크다운 문서를 `Backups/` 하위로 안전하게 격리 보관.
  - 정식 출시 기준인 **`V1.0.0/`** 마스터 스냅샷 폴더를 신설하여 클린 베이스라인 확립.
- **마크다운(.md) 문서 체계 정돈**:
  - 최신 글로벌 헌장(`AGENTS.md` - 제10조 사내/온라인 인증 분리 원칙 포함), 버전 및 서명 규정(`VERSION_RULES.md`), 통합 설명서(`README.md`), 기능 대장(`FEATURE_REGISTRY.md`)으로 루트 문서를 일목요연하게 표준화.

### 🔒 ADS 2중 보안 인증 및 SAC 디지털 서명 빌드 자동화 완비
- **Windows 스마트 앱 컨트롤(SAC) 통과용 디지털 서명 자동 주입 (`build_installer.bat`)**:
  - `build_installer.bat` 실행 시 `signtool.exe`와 마스터 인증서(`ADS_CodeSign_Private.pfx`)를 통해 앱 본체(`dist\MY_PDF.exe`)와 최종 설치 파일(`MY_PDF_Setup.exe`) 양쪽 모두에 SHA256 디지털 서명 및 타임스탬프를 자동 날인하도록 파이프라인 고도화.
  - 빌드 및 서명 완료 즉시 `D:\coding\Utility\office\Setups\MY_PDF_Setup.exe` (및 `C:\dev_app\office\Setups\`)로 자동 배포 동기화.
- **사내 데스크톱 설치본 vs 온라인 웹/PWA 완벽 분리**:
  - 데스크톱 래퍼(`src-desktop\Program.cs`) 진입점에는 사내 1년 주기 라이선스 검증(`AdsCertChecker.CheckLicense()`) 탑재.
  - 온라인 웹/PWA 코어(`pixpdf.html`, `index.html`, `sw.js`, `manifest.json`)는 사내 인증서 코드가 전혀 포함되지 않은 100% 순수 클라이언트 구조로 유지하여 GitHub Pages 및 모바일 PWA 무결성 보장.

### ✨ V1.0.0 탑재 핵심 기능 요약
- **단일 하이브리드 워크스페이스**: PDF와 다중 이미지를 구분 없이 불러와 순서 정렬, 복제, 빈 페이지 삽입, 선택 병합(`PDF 저장`) 및 10종 이미지 포맷 일괄 변환(`Img 저장`).
- **용지(Paper) vs 이미지(Image) 분리 WYSIWYG 엔진**: 1열 썸네일, 2열 메인 뷰어, 3열 미니 프리뷰 실시간 100% 동기화 렌더링.
- **고급 변형 및 보정 도구**: 90°/미세 각도 회전, 가로비율(뚱뚱/홀쭉), 사다리꼴(대두/소두), 4모서리 사각 투시 변환(Perspective Warp), 용지 자르기(Crop), 밝기/대비/선명도/흑백 필터.
- **다중 레이어 오버레이**: 텍스트(글상자), 도형(사각형/원/선/화살표), 추가 이미지 레이어 삽입 및 자유 편집.
- **PWA 무중단 자동 업데이트**: Network-First HTML 전략 및 `skipWaiting`/`controllerchange` 연동을 통한 실시간 자동 갱신.
