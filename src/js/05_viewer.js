    async function renderMainViewerCanvas(index) {
      const canvas = document.getElementById('mainViewerCanvas');
      if (!canvas) return;
      const wrap = document.getElementById('viewerWrap');
      const item = docState.items[index];
      if (!item) return;

      const cfg = getEffectiveItemSettings(index);

      if (item.type === 'pdf' && !item.imgObj) {
        await ensureItemCanvas(item);
      }
      canvas.style.filter = 'none';
      canvas.style.transform = 'none';
      drawPaperWithImage(canvas, item, cfg, { isThumbnail: false });
      const isTransparent = ((cfg.format || 'png') === 'png') && (cfg.transparentBg !== false);
      if (wrap) wrap.classList.toggle('checkerboard-bg', isTransparent);
      if (typeof isCropActive !== 'undefined' && isCropActive && typeof updateCropOverlayPositions === 'function') {
        updateCropOverlayPositions();
      }
    }

    // 2열 메인 뷰어 로드
    async function loadMainViewer(index) {
      const total = docState.items.length;
      if (total === 0) return;

      docState.currentIndex = index;

      const pageText = `${index + 1} / ${total}`;
      const vpi = document.getElementById('viewerPageIndicator');
      if (vpi) vpi.textContent = pageText;
      const mpi = document.getElementById('mobilePageIndicator');
      if (mpi) mpi.textContent = pageText;

      document.querySelectorAll('.thumb-card').forEach((c, i) => c.classList.toggle('active', i === index));
      const targetCard = document.getElementById(`thumb-card-${index}`);
      if (targetCard) targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      document.getElementById('viewerEmptyMsg').style.display = 'none';
      const wrap = document.getElementById('viewerWrap');
      wrap.style.display = 'block';

      // 1. 메인 뷰어 캔버스 렌더링 (회전 각도 정밀 반영)
      await renderMainViewerCanvas(index);

      // 2. 우측 컨트롤을 현재 페이지 상태(개별 or 글로벌)로 완전 동기화 (투시변환 페이지별 상태 포함)
      syncControlsForCurrentPage();

      // 3. 줌 및 미니 프리뷰 갱신
      applyZoom();
      updateViewerEdits(index);
      updateMiniPreview();
      if (isPerspectiveActive) {
        updateCornerPins();
      } else {
        const overlay = document.getElementById('perspectiveOverlay');
        if (overlay) overlay.style.display = 'none';
      }

      if (typeof isCropActive !== 'undefined' && isCropActive) {
        openCropMode();
      } else {
        const cropOverlay = document.getElementById('cropOverlay');
        if (cropOverlay) cropOverlay.style.display = 'none';
      }
    }

    function navigateViewer(delta) {
      const max = docState.items.length;
      if (max === 0) return;
      let next = docState.currentIndex + delta;
      if (next < 0) next = 0;
      if (next >= max) next = max - 1;
      loadMainViewer(next);
    }

    function adjustZoom(delta) {
      const nextZoom = Math.max(0.3, Math.min(3.0, docState.zoom + delta));
      docState.zoom = nextZoom;
      applyZoom();
    }
    function resetZoom() {
      docState.zoom = 1.0;
      docState.savedZoomBeforePerspective = null;
      applyZoom();
    }
    function applyZoom() {
      const wrap = document.getElementById('viewerWrap');
      if (wrap) wrap.style.transform = `scale(${docState.zoom})`;
      const badge = document.getElementById('viewerZoomBadge');
      if (badge) badge.textContent = `${Math.round(docState.zoom * 100)}%`;
      if (isPerspectiveActive) updateCornerPins();
    }

    async function updateViewerEdits(targetIdx) {
      const curIdx = targetIdx !== undefined ? targetIdx : docState.currentIndex;
      const item = docState.items[curIdx];
      if (!item) return;
      const cfg = getEffectiveItemSettings(curIdx);
      if (!cfg) return;

      const activeCurIdx = docState.currentIndex;
      const mvc = document.getElementById('mainViewerCanvas');
      const tc = document.getElementById(`thumb-canvas-${curIdx}`);

      if (curIdx === activeCurIdx && mvc) {
        mvc.style.filter = 'none';
        mvc.style.transform = 'none';
        await renderMainViewerCanvas(curIdx);
      }
      if (tc) {
        tc.style.filter = 'none';
        tc.style.transform = 'none';
        await updateThumbnailCanvas(curIdx);
      }
      if (isPerspectiveActive && curIdx === activeCurIdx) {
        updateCornerPins();
      }
    }

    function updateMainViewerFilters() {
      updateViewerEdits();
    }

    function adjustPreviewScale(delta) {
      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      const curScale = cfg.contentScale || 1.0;
      cfg.contentScale = Math.max(0.2, Math.min(3.0, Math.round((curScale + delta) * 100) / 100));
      updateViewerEdits();
      updateMiniPreview();
    }

    function resetPreviewScale() {
      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      cfg.contentScale = 1.0;
      updateViewerEdits();
      updateMiniPreview();
    }

    function adjustScaleX(delta) {
      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      const cur = cfg.scaleX !== undefined ? cfg.scaleX : 1.0;
      cfg.scaleX = Math.max(0.2, Math.min(3.0, Math.round((cur + delta) * 100) / 100));
      updateViewerEdits();
      updateMiniPreview();
    }

    function resetScaleX() {
      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      cfg.scaleX = 1.0;
      updateViewerEdits();
      updateMiniPreview();
    }

    function adjustTrapezoid(mode) {
      const curIdx = docState.currentIndex;
      const item = docState.items[curIdx];
      if (!item) return;
      const cfg = getEffectiveItemSettings(curIdx);
      if (!cfg.trapExp) {
        cfg.trapExp = { top: 0, bot: 0 };
      }

      // 원본 이미지/PDF 가로 크기 기준 1% 고정 스텝 (최소 1px)
      const baseW = item.width || item.imgObj?.naturalWidth || item.imgObj?.width || 1000;
      const stepPx = Math.max(1, Math.round(baseW * 0.01));

      if (mode === 'top' || mode > 0) {
        // 대두: 윗변 길이 확대 (밑변은 기존 크기 그대로 유지)
        cfg.trapExp.top = (cfg.trapExp.top || 0) + stepPx;
      } else if (mode === 'bot' || mode < 0) {
        // 소두: 밑변 길이 확대 (윗변은 기존 크기 그대로 유지)
        cfg.trapExp.bot = (cfg.trapExp.bot || 0) + stepPx;
      }

      updateViewerEdits();
      updateMiniPreview();
      if (isPerspectiveActive) updateCornerPins();
    }

    function resetTrapezoid() {
      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      cfg.trapExp = { top: 0, bot: 0 };
      cfg.trapezoid = 0;
      updateViewerEdits();
      updateMiniPreview();
      if (isPerspectiveActive) updateCornerPins();
    }

    function adjustBrightness(delta) {
      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      const cur = cfg.brightness !== undefined ? cfg.brightness : 100;
      cfg.brightness = Math.max(20, Math.min(250, cur + delta));
      updateViewerEdits();
      updateMiniPreview();
    }

    function resetBrightness() {
      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      cfg.brightness = 100;
      updateViewerEdits();
      updateMiniPreview();
    }

    function adjustContrast(delta) {
      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      const cur = cfg.contrast !== undefined ? cfg.contrast : 100;
      cfg.contrast = Math.max(20, Math.min(250, cur + delta));
      updateViewerEdits();
      updateMiniPreview();
    }

    function resetContrast() {
      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      cfg.contrast = 100;
      updateViewerEdits();
      updateMiniPreview();
    }

    // [핵심] 사각 투시 변환(4-Corner Pinning) 대화형 편집 상태
    let isPerspectiveActive = false;
    let selectedCornerKey = null; // 'tl' | 'tr' | 'br' | 'bl'
    let isPinDragging = false;
    let isDraggingMiniPin = false;
    let isMiniPanning = false;
    let miniPanStartX = 0;
    let miniPanStartY = 0;
    let miniPanStartOffsetX = 0;
    let miniPanStartOffsetY = 0;
    let activeDraggingPinKey = null;
    let pinDragStartMouseX = 0;
    let pinDragStartMouseY = 0;
    let pinDragStartCornerVal = { x: 0, y: 0 };

    // 메인 뷰어 캔버스 상의 이미지 4개 코너 절대 좌표(캔버스 픽셀 단위) 산출
