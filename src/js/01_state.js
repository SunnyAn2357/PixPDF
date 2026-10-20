    const isHttpEnv = window.location.protocol.startsWith('http');

    console.log('%c====================================================', 'color: #0d9488; font-weight: bold;');
    console.log('%c🚀 PixPDF 로딩 완료! (PDF & 이미지 양방향 변환·편집기)', 'color: #0f766e; font-size: 13px; font-weight: bold;');
    console.log('%c✨ 현재 버전: v2.12.1 (종이 연동 자르기 시 인쇄·내보내기 페이지 배율 및 가로폭 1:1 일관성 보장)', 'color: #0d9488; font-weight: bold;');
    console.log('%c🔒 100% 로컬 브라우저 메모리 격리 구동 (Zero-Server & Offline-First)', 'color: #10b981; font-weight: bold;');
    console.log('%c🛡️ 보안 무결성: 외부 서버 데이터 전송 일체 없음', 'color: #64748b;');
    if (isHttpEnv) {
      console.log('%c🌐 실행 환경: 웹 호스팅 PWA 모드 (https://)', 'color: #6366f1; font-weight: bold;');
    } else {
      console.log('%c📁 실행 환경: 오프라인 단독 로컬 파일 모드 (file://)', 'color: #6366f1; font-weight: bold;');
      console.log('%c⚡ 로컬 안전 모드: 네트워크 및 매니페스트 요청 차단 (콘솔 무오류 보장)', 'color: #10b981;');
    }
    console.log('%c====================================================', 'color: #0d9488; font-weight: bold;');

    // PWA Manifest 및 Service Worker는 http/https 환경에서만 안전하게 구동 (file:// 환경에서의 CORS 에러 및 net::ERR_FAILED 원천 차단)
    if (isHttpEnv) {
      const manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.href = 'manifest.json';
      document.head.appendChild(manifestLink);

      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./sw.js').then((reg) => {
            console.log('%c✅ 서비스 워커 등록 완료! Scope: ' + reg.scope, 'color: #10b981; font-weight: bold;');

            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('%c🔄 [PixPDF PWA] 새 버전 감지: 자동 갱신 적용', 'color: #0d9488; font-weight: bold;');
                    newWorker.postMessage({ action: 'skipWaiting' });
                  }
                });
              }
            });
          }).catch((err) => {
            console.warn('[PixPDF PWA] 서비스 워커 등록 스킵:', err);
          });

          let refreshing = false;
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
              refreshing = true;
              window.location.reload();
            }
          });
        });
      }
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // 표준 용지 밀리미터(mm) 및 300DPI 기준 픽셀(px) 규격표
    const PAPER_SPECS = {
      a3: { name: 'A3 (297×420mm)', wMm: 297, hMm: 420, ratio: 1.414, pxW: 3508, pxH: 4960 },
      a4: { name: 'A4 (210×297mm)', wMm: 210, hMm: 297, ratio: 1.414, pxW: 2480, pxH: 3508 },
      a5: { name: 'A5 (148×210mm)', wMm: 148, hMm: 210, ratio: 1.414, pxW: 1748, pxH: 2480 },
      b3: { name: 'B3 (353×500mm)', wMm: 353, hMm: 500, ratio: 1.416, pxW: 4169, pxH: 5906 },
      b4: { name: 'B4 (250×353mm)', wMm: 250, hMm: 353, ratio: 1.412, pxW: 2953, pxH: 4169 },
      b5: { name: 'B5 (176×250mm)', wMm: 176, hMm: 250, ratio: 1.420, pxW: 2079, pxH: 2953 }
    };

    function handlePaperSizeChange(mode) {
      if (mode === 'pdf2img') {
        const val = document.getElementById('selPageFit').value;
        document.getElementById('groupCustomPxPdf').style.display = val === 'custom' ? 'flex' : 'none';
      } else {
        const val = document.getElementById('selPdfPageSize').value;
        document.getElementById('groupCustomPxImg').style.display = val === 'custom' ? 'flex' : 'none';
      }
      updateMiniPreview();
    }

    // 용지 규격 해석 유틸리티 (규격명, 방향, 원본 크기 등을 기반으로 최적 치수 산출)
    function resolvePaperGeometry(key, isLandscape, origW, origH, customW, customH) {
      if (key === 'original') {
        return {
          name: '원본 규격',
          ratio: origW / origH,
          widthPx: origW,
          heightPx: origH,
          isLandscape: origW > origH
        };
      }
      if (key === 'custom') {
        const cw = Math.max(100, customW || 1920);
        const ch = Math.max(100, customH || 1080);
        return {
          name: `사용자 정의 (${cw}×${ch}px)`,
          ratio: cw / ch,
          widthPx: cw,
          heightPx: ch,
          isLandscape: cw > ch
        };
      }
      const spec = PAPER_SPECS[key] || PAPER_SPECS.a4;
      const w = isLandscape ? Math.max(spec.pxW, spec.pxH) : Math.min(spec.pxW, spec.pxH);
      const h = isLandscape ? Math.min(spec.pxW, spec.pxH) : Math.max(spec.pxW, spec.pxH);
      return {
        name: `${spec.name.split(' ')[0]} ${isLandscape ? '가로' : '세로'}`,
        ratio: w / h,
        widthPx: w,
        heightPx: h,
        isLandscape: isLandscape
      };
    }

    // [핵심] 단일 통합 작업 공간 상태 관리 (PDF와 이미지 구분 없이 섞어서 편집)
    const docState = {
      items: [],
      openedFiles: [], // [{ fileId, name, type, file, doc, totalDocPages, openedAt }] // [{ type: 'pdf'|'image', doc, pageNum, name, width, height, imgObj, file, settings: { fit, pageSize, quality, scale, rot, rotTarget, contentScale, scaleX, trapezoid, brightness, contrast, offsetX, offsetY, orient, margin, format, transparentBg, customW, customH } }]
      checkList: [],
      currentIndex: 0,
      zoom: 1.0,
      fileName: 'PixPDF_Document',
      globalSettings: {
        fit: 'original',
        pageSize: 'original',
        quality: 'ultra',
        scale: 3.0,
        rot: 0,
        rotPage: 0,
        rotImg: 0,
        rotTarget: { page: true, image: true },
        contentScale: 1.0,
        scaleX: 1.0,
        trapezoid: 0,
        brightness: 100,
        contrast: 100,
        offsetX: 0,
        offsetY: 0,
        format: 'png',
        transparentBg: true,
        orient: 'auto',
        margin: 0,
        customW: 1920,
        customH: 1080
      }
    };

    // 작업 상태 안내 메시지 (오른쪽 창 리모콘 밑 안내창 갱신)
    function updateStatusMsg(text) {
      const hint = document.getElementById('statusHintText');
      if (hint) {
        hint.textContent = text;
      }
      const st = document.getElementById('statusText');
      if (st) {
        st.textContent = text;
      }
    }
