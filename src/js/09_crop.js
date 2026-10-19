    // ==========================================================================
    // [MODULE] 09_crop.js
    // 비파괴 사각형 크롭(자르기) 및 [객체 자르기] / [종이 연동 자르기] 엔진
    // ==========================================================================

    let isCropActive = false;
    let cropBox = { x: 0, y: 0, w: 1, h: 1 }; // 0.0 ~ 1.0 비율 좌표 (기본은 객체 가장 바깥)
    let cropPaperMode = false; // false: 객체 자르기, true: 종이 연동 자르기
    let activeCropDrag = null; // { handle, startX, startY, origBox, imgRect }

    // 크롭 모드 토글 (우측 패널 [자르기] 버튼 등에서 호출)
    function toggleCropMode() {
      if (window.innerWidth <= 860) {
        if (typeof showExitToast === 'function') showExitToast('자르기 기능은 PC 환경에서 지원됩니다.');
        return;
      }
      if (docState.items.length === 0) {
        if (typeof showExitToast === 'function') showExitToast('불러온 문서가 없습니다.');
        return;
      }
      const overlay = document.getElementById('cropOverlay');
      if (!overlay) return;

      if (isCropActive) {
        cancelCrop();
      } else {
        openCropMode();
      }
    }

    function openCropMode() {
      if (window.innerWidth <= 860) return;
      const item = docState.items[docState.currentIndex];
      if (!item) return;

      // 투시변환이 켜져 있다면 충돌 방지를 위해 먼저 닫기 (상호 배타)
      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      if (cfg && cfg.isPerspectiveActive) {
        if (typeof togglePerspectiveMode === 'function') togglePerspectiveMode();
      }

      isCropActive = true;
      const overlay = document.getElementById('cropOverlay');
      if (overlay) overlay.style.display = 'block';

      // 2열 중앙 툴바 표시
      const cropToolbar = document.getElementById('viewerCropToolbar');
      if (cropToolbar) cropToolbar.style.display = 'flex';

      // 기존 설정 복원 또는 객체 가장 바깥 100% 가이드 박스로 초기화
      const settings = item.settings || {};
      if (settings.crop) {
        cropBox = {
          x: Math.max(0, Math.min(0.95, settings.crop.x || 0)),
          y: Math.max(0, Math.min(0.95, settings.crop.y || 0)),
          w: Math.max(0.05, Math.min(1 - (settings.crop.x || 0), settings.crop.w || 1)),
          h: Math.max(0.05, Math.min(1 - (settings.crop.y || 0), settings.crop.h || 1))
        };
        cropPaperMode = Boolean(settings.crop.cropPaper);
      } else {
        cropBox = { x: 0, y: 0, w: 1, h: 1 };
        cropPaperMode = false;
      }

      updateCropPaperModeUI();
      updateCropOverlayPositions();
      initCropDragEvents();

      const btnCrop = document.getElementById('btnToggleCrop');
      if (btnCrop) btnCrop.classList.add('active');
    }

    function cancelCrop() {
      isCropActive = false;
      const overlay = document.getElementById('cropOverlay');
      if (overlay) overlay.style.display = 'none';

      // 2열 중앙 툴바 숨김
      const cropToolbar = document.getElementById('viewerCropToolbar');
      if (cropToolbar) cropToolbar.style.display = 'none';

      const btnCrop = document.getElementById('btnToggleCrop');
      if (btnCrop) btnCrop.classList.remove('active');
    }

    function setCropPaperMode(isPaper) {
      cropPaperMode = Boolean(isPaper);
      updateCropPaperModeUI();
    }

    function updateCropPaperModeUI() {
      const btnImg = document.getElementById('btnCropModeImage');
      const btnPaper = document.getElementById('btnCropModePaper');
      if (btnImg && btnPaper) {
        if (cropPaperMode) {
          btnImg.classList.remove('active');
          btnPaper.classList.add('active');
        } else {
          btnImg.classList.add('active');
          btnPaper.classList.remove('active');
        }
      }
    }

    // 중앙 메인 뷰어 캔버스 상의 이미지 실제 화면 좌표(스크린 사각형) 계산
    function getCropImageScreenRect() {
      const canvas = document.getElementById('mainViewerCanvas');
      const curIdx = docState.currentIndex;
      const item = docState.items[curIdx];
      if (!canvas || !item || canvas.width === 0 || canvas.height === 0) return null;

      const cfg = getEffectiveItemSettings(curIdx);
      const dispW = canvas.clientWidth || canvas.offsetWidth;
      const dispH = canvas.clientHeight || canvas.offsetHeight;
      if (!dispW || !dispH) return null;

      const scaleX = dispW / canvas.width;
      const scaleY = dispH / canvas.height;

      // getCornerCanvasPoints 헬퍼를 통해 이미지 위치 획득
      if (typeof getCornerCanvasPoints === 'function') {
        const pts = getCornerCanvasPoints(item, cfg, canvas.width, canvas.height);
        if (pts) {
          const minX = Math.min(pts.tl.x, pts.tr.x, pts.br.x, pts.bl.x) * scaleX;
          const minY = Math.min(pts.tl.y, pts.tr.y, pts.br.y, pts.bl.y) * scaleY;
          const maxX = Math.max(pts.tl.x, pts.tr.x, pts.br.x, pts.bl.x) * scaleX;
          const maxY = Math.max(pts.tl.y, pts.tr.y, pts.br.y, pts.bl.y) * scaleY;
          return {
            x: Math.max(0, minX),
            y: Math.max(0, minY),
            w: Math.max(20, maxX - minX),
            h: Math.max(20, maxY - minY),
            dispW,
            dispH
          };
        }
      }

      // 폴백: 캔버스 전체 기준
      return { x: 0, y: 0, w: dispW, h: dispH, dispW, dispH };
    }

    // SVG 마스크, 격자선, 8개 조절 핸들 화면 위치 갱신
    function updateCropOverlayPositions() {
      if (!isCropActive) return;
      const rect = getCropImageScreenRect();
      if (!rect) return;

      const boxX = rect.x + (cropBox.x * rect.w);
      const boxY = rect.y + (cropBox.y * rect.h);
      const boxW = Math.max(15, cropBox.w * rect.w);
      const boxH = Math.max(15, cropBox.h * rect.h);

      // 1. 마스크 구멍 (남길 영역은 투명하게 뚫음)
      const cropHole = document.getElementById('cropHole');
      if (cropHole) {
        cropHole.setAttribute('x', String(boxX));
        cropHole.setAttribute('y', String(boxY));
        cropHole.setAttribute('width', String(boxW));
        cropHole.setAttribute('height', String(boxH));
      }

      // 2. 테두리 사각형
      const cropBorder = document.getElementById('cropBoxBorder');
      if (cropBorder) {
        cropBorder.setAttribute('x', String(boxX));
        cropBorder.setAttribute('y', String(boxY));
        cropBorder.setAttribute('width', String(boxW));
        cropBorder.setAttribute('height', String(boxH));
      }

      // 3. 3x3 격자 가이드선
      const gH1 = document.getElementById('cropGridH1');
      const gH2 = document.getElementById('cropGridH2');
      const gV1 = document.getElementById('cropGridV1');
      const gV2 = document.getElementById('cropGridV2');

      const y1 = boxY + boxH / 3;
      const y2 = boxY + (boxH * 2) / 3;
      const x1 = boxX + boxW / 3;
      const x2 = boxX + (boxW * 2) / 3;

      if (gH1) { gH1.setAttribute('x1', String(boxX)); gH1.setAttribute('y1', String(y1)); gH1.setAttribute('x2', String(boxX + boxW)); gH1.setAttribute('y2', String(y1)); }
      if (gH2) { gH2.setAttribute('x1', String(boxX)); gH2.setAttribute('y1', String(y2)); gH2.setAttribute('x2', String(boxX + boxW)); gH2.setAttribute('y2', String(y2)); }
      if (gV1) { gV1.setAttribute('x1', String(x1)); gV1.setAttribute('y1', String(boxY)); gV1.setAttribute('x2', String(x1)); gV1.setAttribute('y2', String(boxY + boxH)); }
      if (gV2) { gV2.setAttribute('x1', String(x2)); gV2.setAttribute('y1', String(boxY)); gV2.setAttribute('x2', String(x2)); gV2.setAttribute('y2', String(boxY + boxH)); }

      // 4. 8개 조절 핸들 배치
      const hTL = document.getElementById('cropHandleTL');
      const hTR = document.getElementById('cropHandleTR');
      const hBR = document.getElementById('cropHandleBR');
      const hBL = document.getElementById('cropHandleBL');
      const hT = document.getElementById('cropHandleT');
      const hR = document.getElementById('cropHandleR');
      const hB = document.getElementById('cropHandleB');
      const hL = document.getElementById('cropHandleL');

      if (hTL) { hTL.style.left = `${boxX}px`; hTL.style.top = `${boxY}px`; }
      if (hTR) { hTR.style.left = `${boxX + boxW}px`; hTR.style.top = `${boxY}px`; }
      if (hBR) { hBR.style.left = `${boxX + boxW}px`; hBR.style.top = `${boxY + boxH}px`; }
      if (hBL) { hBL.style.left = `${boxX}px`; hBL.style.top = `${boxY + boxH}px`; }

      if (hT) { hT.style.left = `${boxX + boxW / 2}px`; hT.style.top = `${boxY}px`; }
      if (hR) { hR.style.left = `${boxX + boxW}px`; hR.style.top = `${boxY + boxH / 2}px`; }
      if (hB) { hB.style.left = `${boxX + boxW / 2}px`; hB.style.top = `${boxY + boxH}px`; }
      if (hL) { hL.style.left = `${boxX}px`; hL.style.top = `${boxY + boxH / 2}px`; }
    }

    // 마우스 및 터치 드래그 상호작용 등록 (8개 핸들 조절 전용, 이미지/박스 전체 흔들림 원천 차단)
    let cropEventsBound = false;
    function initCropDragEvents() {
      if (cropEventsBound) return;
      cropEventsBound = true;

      const overlay = document.getElementById('cropOverlay');
      if (!overlay) return;

      overlay.addEventListener('pointerdown', (e) => {
        if (!isCropActive) return;
        const target = e.target.closest('.crop-handle');
        if (!target) return;

        e.preventDefault();
        e.stopPropagation();

        const rect = getCropImageScreenRect();
        if (!rect) return;

        const handleType = target.getAttribute('data-handle');
        if (!handleType) return;

        activeCropDrag = {
          handle: handleType,
          startX: e.clientX,
          startY: e.clientY,
          origBox: { ...cropBox },
          imgRect: rect
        };

        window.addEventListener('pointermove', onCropPointerMove);
        window.addEventListener('pointerup', onCropPointerUp);
        window.addEventListener('pointercancel', onCropPointerUp);
      });
    }

    function onCropPointerMove(e) {
      if (!activeCropDrag || !isCropActive) return;

      const { handle, startX, startY, origBox, imgRect } = activeCropDrag;
      const dxNorm = (e.clientX - startX) / imgRect.w;
      const dyNorm = (e.clientY - startY) / imgRect.h;

      const minDim = 0.05; // 최소 5% 크기 보장

      let newX = origBox.x;
      let newY = origBox.y;
      let newW = origBox.w;
      let newH = origBox.h;

      // 좌/우 조절
      if (handle.includes('l')) {
        const maxLeft = origBox.x + origBox.w - minDim;
        newX = Math.max(0, Math.min(maxLeft, origBox.x + dxNorm));
        newW = origBox.w + (origBox.x - newX);
      } else if (handle.includes('r')) {
        newW = Math.max(minDim, Math.min(1 - origBox.x, origBox.w + dxNorm));
      }

      // 상/하 조절
      if (handle.includes('t')) {
        const maxTop = origBox.y + origBox.h - minDim;
        newY = Math.max(0, Math.min(maxTop, origBox.y + dyNorm));
        newH = origBox.h + (origBox.y - newY);
      } else if (handle.includes('b')) {
        newH = Math.max(minDim, Math.min(1 - origBox.y, origBox.h + dyNorm));
      }

      cropBox = { x: newX, y: newY, w: newW, h: newH };
      requestAnimationFrame(updateCropOverlayPositions);
    }

    function onCropPointerUp() {
      if (!activeCropDrag) return;
      activeCropDrag = null;
      window.removeEventListener('pointermove', onCropPointerMove);
      window.removeEventListener('pointerup', onCropPointerUp);
      window.removeEventListener('pointercancel', onCropPointerUp);
    }

    // [적용] 버튼: 비파괴 설정 저장 및 캔버스 렌더링 동기화
    function applyCrop() {
      const item = docState.items[docState.currentIndex];
      if (!item) return;

      if (!item.settings) item.settings = {};

      // 99% 이상 전체 크기인 경우 크롭 해제
      const isFull = (cropBox.x <= 0.01 && cropBox.y <= 0.01 && cropBox.w >= 0.98 && cropBox.h >= 0.98);
      if (isFull) {
        item.settings.crop = null;
      } else {
        item.settings.crop = {
          x: Math.max(0, Math.min(0.95, cropBox.x)),
          y: Math.max(0, Math.min(0.95, cropBox.y)),
          w: Math.max(0.05, Math.min(1 - cropBox.x, cropBox.w)),
          h: Math.max(0.05, Math.min(1 - cropBox.y, cropBox.h)),
          cropPaper: Boolean(cropPaperMode)
        };
      }

      // 캐시 무효화
      if (item._croppedCanvas) {
        item._croppedCanvas.width = 0;
        item._croppedCanvas.height = 0;
        item._croppedCanvas = null;
      }

      cancelCrop();

      // 3개 창 렌더링 즉시 동기화:
      // 1. 가운데 2열 메인 뷰어 캔버스
      if (typeof renderMainViewerCanvas === 'function') {
        await renderMainViewerCanvas(docState.currentIndex);
      }
      // 2. 왼쪽 1열 썸네일 카드 캔버스
      if (typeof renderSingleThumbnailCard === 'function') {
        await renderSingleThumbnailCard(docState.currentIndex);
      }
      // 3. 우측(PC 기준 좌측 미리보기 창) 객체 설정 내 미니 프리뷰
      if (typeof updateMiniPreview === 'function') {
        updateMiniPreview();
      }

      const msg = cropPaperMode ? '종이 연동 자르기가 적용되었습니다.' : '객체 자르기가 적용되었습니다.';
      if (typeof showExitToast === 'function') showExitToast(msg);
    }

    // [리셋] 버튼 (오버레이 내부에서 전체 영역으로 복귀)
    function resetCrop() {
      cropBox = { x: 0, y: 0, w: 1, h: 1 };
      updateCropOverlayPositions();
    }

    // [리셋] 버튼 (우측 패널에서 현재 항목의 크롭 100% 완전 초기화)
    function resetCropCurrentItem() {
      const item = docState.items[docState.currentIndex];
      if (!item) return;

      if (item.settings) {
        item.settings.crop = null;
      }
      if (item._croppedCanvas) {
        item._croppedCanvas.width = 0;
        item._croppedCanvas.height = 0;
        item._croppedCanvas = null;
      }

      if (isCropActive) {
        cropBox = { x: 0, y: 0, w: 1, h: 1 };
        updateCropOverlayPositions();
        cancelCrop();
      }

      // 3개 창 렌더링 즉시 동기화:
      // 1. 가운데 2열 메인 뷰어 캔버스
      if (typeof renderMainViewerCanvas === 'function') {
        await renderMainViewerCanvas(docState.currentIndex);
      }
      // 2. 왼쪽 1열 썸네일 카드 캔버스
      if (typeof renderSingleThumbnailCard === 'function') {
        await renderSingleThumbnailCard(docState.currentIndex);
      }
      // 3. 우측(PC 기준 좌측 미리보기 창) 객체 설정 내 미니 프리뷰
      if (typeof updateMiniPreview === 'function') {
        updateMiniPreview();
      }

      if (typeof showExitToast === 'function') showExitToast('자르기 영역이 초기화되었습니다.');
    }

    // --------------------------------------------------------------------------
    // [렌더 파이프라인 연동 헬퍼]
    // --------------------------------------------------------------------------

    // 아이템의 크롭 유효 소스 캔버스 반환 (비파괴적 슬라이스)
    function getEffectiveImageSource(item) {
      if (!item || !item.imgObj) return null;
      const settings = item.settings;
      if (!settings || !settings.crop) return item.imgObj;

      const crop = settings.crop;
      if (crop.w >= 0.995 && crop.h >= 0.995 && crop.x <= 0.005 && crop.y <= 0.005) {
        return item.imgObj;
      }

      const origW = item.imgObj.naturalWidth || item.imgObj.width || item.width;
      const origH = item.imgObj.naturalHeight || item.imgObj.height || item.height;
      if (!origW || !origH) return item.imgObj;

      const sx = Math.max(0, Math.round(crop.x * origW));
      const sy = Math.max(0, Math.round(crop.y * origH));
      const sw = Math.max(1, Math.min(origW - sx, Math.round(crop.w * origW)));
      const sh = Math.max(1, Math.min(origH - sy, Math.round(crop.h * origH)));

      const key = `${sx}_${sy}_${sw}_${sh}`;
      if (item._croppedCanvas && item._croppedCanvas.width === sw && item._croppedCanvas.height === sh && item._croppedKey === key) {
        return item._croppedCanvas;
      }

      const c = document.createElement('canvas');
      c.width = sw;
      c.height = sh;
      const ctx = c.getContext('2d');
      ctx.drawImage(item.imgObj, sx, sy, sw, sh, 0, 0, sw, sh);

      item._croppedCanvas = c;
      item._croppedKey = key;
      return c;
    }

    // 아이템의 유효 렌더링 치수 반환
    function getEffectiveImageDimensions(item) {
      if (!item || !item.imgObj) return { width: 0, height: 0 };
      const origW = item.width || item.imgObj.naturalWidth || item.imgObj.width;
      const origH = item.height || item.imgObj.naturalHeight || item.imgObj.height;
      if (!item.settings || !item.settings.crop) {
        return { width: origW, height: origH };
      }
      const crop = item.settings.crop;
      return {
        width: Math.max(10, Math.round(origW * (crop.w || 1))),
        height: Math.max(10, Math.round(origH * (crop.h || 1)))
      };
    }

    // 창 크기가 모바일(860px 이하)로 축소될 경우 열려 있던 자르기 모드 자동 해제
    window.addEventListener('resize', () => {
      if (window.innerWidth <= 860 && isCropActive) {
        cancelCrop();
      }
    });
