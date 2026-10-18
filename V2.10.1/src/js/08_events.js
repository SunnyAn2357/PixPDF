    // -------------------------------------------------------------
    // 전역 Ctrl + 마우스 휠 분기 처리 (PC 모드 전용 창별 독립 조절 / 브라우저 전체 확대 차단)
    // -------------------------------------------------------------
    window.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return; // 일반 휠 스크롤은 통과

      // 1. 브라우저 전체 페이지 확대/축소 무조건 차단
      e.preventDefault();

      // 모바일 모드(<= 860px)에서는 왼쪽창 폭 조절 금지, 가운데창 없음
      if (window.innerWidth <= 860) return;

      // 2. 왼쪽 창 (#colThumb): Ctrl + 휠 시 너비(폭) 조절 (휠 업: 폭 확대, 휠 다운: 폭 축소)
      const colThumb = document.getElementById('colThumb');
      if (colThumb && colThumb.contains(e.target)) {
        const curW = colThumb.offsetWidth;
        const delta = e.deltaY < 0 ? 20 : -20;
        const nextW = Math.max(200, Math.min(550, curW + delta));
        colThumb.style.width = `${nextW}px`;
        colThumb.style.maxWidth = '600px';
        return;
      }

      // 3. 가운데 창 (#colViewerArea): Ctrl + 휠 시 중앙 메인 뷰어 캔버스만 확대/축소
      const colViewerArea = document.getElementById('colViewerArea');
      if (colViewerArea && colViewerArea.contains(e.target)) {
        const zoomDelta = e.deltaY < 0 ? 0.15 : -0.15;
        adjustZoom(zoomDelta);
        return;
      }

      // 4. 오른쪽 창 (#colControl): Ctrl + 휠 동작 무시 (아무 동작도 하지 않음)
      const colControl = document.getElementById('colControl');
      if (colControl && colControl.contains(e.target)) {
        return;
      }
    }, { passive: false });

    // 가운데 창 일반 휠 페이지 탐색 (Ctrl 없는 일반 스크롤)
    let wheelThrottleTimer = null;
    const viewerViewport = document.getElementById('viewerViewport');
    if (viewerViewport) {
      viewerViewport.addEventListener('wheel', (e) => {
        if (e.ctrlKey) return; // Ctrl + 휠은 전역 분기 핸들러에서 전담 처리

        e.preventDefault();
        if (wheelThrottleTimer) return;
        wheelThrottleTimer = setTimeout(() => { wheelThrottleTimer = null; }, 180);

        if (e.deltaY > 0) {
          navigateViewer(1);
        } else if (e.deltaY < 0) {
          navigateViewer(-1);
        }
      }, { passive: false });
    }

    // -------------------------------------------------------------
    // 가운데 메인 뷰어 마우스/터치 드래그로 이미지 이동 (상/하/좌/우 실시간 패닝)
    // -------------------------------------------------------------
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panStartOffsetX = 0;
    let panStartOffsetY = 0;

    const viewerWrap = document.getElementById('viewerWrap');
    // 모바일/우측 미니 스테이지 상의 투시 핀 터치/마우스 드래그 리스너 등록
    const miniStageEl = document.getElementById('previewSheetStage') || document.getElementById('miniSheet');
    if (miniStageEl) {
      miniStageEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const pinEl = e.target.closest('.mini-corner-pin');
        if (pinEl && isPerspectiveActive) {
          e.preventDefault();
          e.stopPropagation();
          const cornerKey = pinEl.dataset.corner;
          selectCorner(cornerKey);
          isPinDragging = true;
          isDraggingMiniPin = true;
          activeDraggingPinKey = cornerKey;

          const sRect = miniStageEl.getBoundingClientRect();
          const pinPad = 11;
          pinDragStartMouseX = Math.max(sRect.left + pinPad, Math.min(sRect.right - pinPad, e.clientX));
          pinDragStartMouseY = Math.max(sRect.top + pinPad, Math.min(sRect.bottom - pinPad, e.clientY));

          const curIdx = docState.currentIndex;
          const cfg = getEffectiveItemSettings(curIdx);
          if (!cfg.corners) {
            cfg.corners = { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } };
          }
          pinDragStartCornerVal = {
            x: cfg.corners[cornerKey]?.x || 0,
            y: cfg.corners[cornerKey]?.y || 0
          };
          updateMiniPinLoupe(cornerKey);
        } else if (docState.items.length > 0 && !isPerspectiveActive) {
          // 미니 프리뷰 내 이미지 마우스 드래그 이동
          isMiniPanning = true;
          const sRect = miniStageEl.getBoundingClientRect();
          miniPanStartX = Math.max(sRect.left, Math.min(sRect.right, e.clientX));
          miniPanStartY = Math.max(sRect.top, Math.min(sRect.bottom, e.clientY));
          const curIdx = docState.currentIndex;
          const cfg = getEffectiveItemSettings(curIdx);
          miniPanStartOffsetX = cfg.offsetX !== undefined ? cfg.offsetX : 0;
          miniPanStartOffsetY = cfg.offsetY !== undefined ? cfg.offsetY : 0;
        }
      });

      miniStageEl.addEventListener('touchstart', (e) => {
        const pinEl = e.target.closest('.mini-corner-pin');
        if (pinEl && isPerspectiveActive) {
          e.preventDefault();
          e.stopPropagation();
          const cornerKey = pinEl.dataset.corner;
          selectCorner(cornerKey);
          isPinDragging = true;
          isDraggingMiniPin = true;
          activeDraggingPinKey = cornerKey;

          const sRect = miniStageEl.getBoundingClientRect();
          const pinPad = 11;
          pinDragStartMouseX = Math.max(sRect.left + pinPad, Math.min(sRect.right - pinPad, e.touches[0].clientX));
          pinDragStartMouseY = Math.max(sRect.top + pinPad, Math.min(sRect.bottom - pinPad, e.touches[0].clientY));

          const curIdx = docState.currentIndex;
          const cfg = getEffectiveItemSettings(curIdx);
          if (!cfg.corners) {
            cfg.corners = { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } };
          }
          pinDragStartCornerVal = {
            x: cfg.corners[cornerKey]?.x || 0,
            y: cfg.corners[cornerKey]?.y || 0
          };
          updateMiniPinLoupe(cornerKey);
        } else if (e.touches.length === 1 && docState.items.length > 0 && !isPerspectiveActive) {
          // 미니 프리뷰 내 이미지 터치 드래그 이동 (Panning) - 회색 박스 시작
          isMiniPanning = true;
          const sRect = miniStageEl.getBoundingClientRect();
          miniPanStartX = Math.max(sRect.left, Math.min(sRect.right, e.touches[0].clientX));
          miniPanStartY = Math.max(sRect.top, Math.min(sRect.bottom, e.touches[0].clientY));
          const curIdx = docState.currentIndex;
          const cfg = getEffectiveItemSettings(curIdx);
          miniPanStartOffsetX = cfg.offsetX !== undefined ? cfg.offsetX : 0;
          miniPanStartOffsetY = cfg.offsetY !== undefined ? cfg.offsetY : 0;
        }
      }, { passive: false });
    }

    if (viewerWrap) {
      viewerWrap.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // 마우스 좌클릭만 처리
        const total = docState.items.length;
        if (total === 0) return;

        // 1. 투시 변환 핀 핸들 드래그 우선 처리
        const pinEl = e.target.closest('.corner-pin');
        if (pinEl && isPerspectiveActive) {
          e.preventDefault();
          e.stopPropagation();
          const cornerKey = pinEl.dataset.corner;
          selectCorner(cornerKey);
          isPinDragging = true;
          isDraggingMiniPin = false;
          activeDraggingPinKey = cornerKey;
          pinDragStartMouseX = e.clientX;
          pinDragStartMouseY = e.clientY;

          const curIdx = docState.currentIndex;
          const cfg = getEffectiveItemSettings(curIdx);
          if (!cfg.corners) {
            cfg.corners = { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } };
          }
          pinDragStartCornerVal = {
            x: cfg.corners[cornerKey]?.x || 0,
            y: cfg.corners[cornerKey]?.y || 0
          };
          updateViewerPinLoupe(cornerKey, e.clientX, e.clientY);
          return;
        }

        // 2. 일반 이미지 캔버스 패닝 (전체 이동)
        e.preventDefault();
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;

        const curIdx = docState.currentIndex;
        const cfg = getEffectiveItemSettings(curIdx);
        panStartOffsetX = cfg.offsetX !== undefined ? cfg.offsetX : 0;
        panStartOffsetY = cfg.offsetY !== undefined ? cfg.offsetY : 0;

        viewerWrap.style.cursor = 'grabbing';
        const mvc = document.getElementById('mainViewerCanvas');
        if (mvc) mvc.style.transition = 'none'; // 드래그 중에는 즉각적인 반응을 위해 트랜지션 해제
      });

      window.addEventListener('mousemove', (e) => {
        // 투시 핀 드래그 처리 (메인 뷰어 및 모바일 미니 프리뷰 양방향 드래그 완벽 지원)
        if (isPinDragging && activeDraggingPinKey) {
          e.preventDefault();
          const canvas = document.getElementById('mainViewerCanvas');
          const curIdx = docState.currentIndex;
          const item = docState.items[curIdx];
          if (!canvas || !item || !item.imgObj || canvas.width === 0 || canvas.height === 0) return;

          const cfg = getEffectiveItemSettings(curIdx);
          const pts = getCornerCanvasPoints(item, cfg, canvas.width, canvas.height);
          if (!pts || !pts.dw || !pts.dh) return;

          if (isDraggingMiniPin) {
            const stageEl = document.getElementById('previewSheetStage');
            const miniSheet = document.getElementById('miniSheet');
            if (stageEl && miniSheet) {
              const sRect = stageEl.getBoundingClientRect();
              const stageX = e.clientX - sRect.left;
              const stageY = e.clientY - sRect.top;
              if (!cfg.corners) {
                cfg.corners = { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } };
              }
              cfg.corners[activeDraggingPinKey] = calcCornerFromMiniStagePos(pts, activeDraggingPinKey, stageX, stageY, miniSheet, stageEl, canvas);
            }
          } else {
            // 가운데 창(메인 뷰어): 용지 밖으로 자유롭게 핀 이동 지원 (캔버스 클램프 완전 제거)
            const dispW = canvas.clientWidth || canvas.offsetWidth;
            const dispH = canvas.clientHeight || canvas.offsetHeight;
            if (!dispW || !dispH) return;
            const scaleX = dispW / canvas.width;
            const scaleY = dispH / canvas.height;
            const zoom = docState.zoom || 1.0;
            const deltaScreenX = (e.clientX - pinDragStartMouseX) / zoom;
            const deltaScreenY = (e.clientY - pinDragStartMouseY) / zoom;

            const deltaCanvX = deltaScreenX / scaleX;
            const deltaCanvY = deltaScreenY / scaleY;

            // 이미지 회전 각도 역변환 (Unrotate)
            const cos = Math.cos(-pts.rotRad);
            const sin = Math.sin(-pts.rotRad);
            const deltaLocalX = deltaCanvX * cos - deltaCanvY * sin;
            const deltaLocalY = deltaCanvX * sin + deltaCanvY * cos;

            const srcW = item.imgObj?.naturalWidth || item.imgObj?.width || pts.dw;
            const srcH = item.imgObj?.naturalHeight || item.imgObj?.height || pts.dh;
            const scalePxX = pts.dw / srcW;
            const scalePxY = pts.dh / srcH;

            // 원본 이미지 픽셀 단위로 환산
            const deltaOrigPxX = Math.round(deltaLocalX / scalePxX);
            const deltaOrigPxY = Math.round(deltaLocalY / scalePxY);

            if (!cfg.corners) {
              cfg.corners = { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } };
            }
            cfg.corners[activeDraggingPinKey] = {
              x: pinDragStartCornerVal.x + deltaOrigPxX,
              y: pinDragStartCornerVal.y + deltaOrigPxY
            };
          }

          updateViewerEdits(curIdx);
          updateMiniPreview();
          updateCornerPins();
          if (isDraggingMiniPin) {
            updateMiniPinLoupe(activeDraggingPinKey);
          } else {
            updateViewerPinLoupe(activeDraggingPinKey, e.clientX, e.clientY);
          }
          return;
        }

        if (isMiniPanning) {
          e.preventDefault();
          const stageEl = document.getElementById('previewSheetStage');
          const miniSheet = document.getElementById('miniSheet');
          if (stageEl) {
            const sRect = stageEl.getBoundingClientRect();
            // 손가락/마우스 이동을 회색 박스(previewSheetStage) 영역 내부로 제한(Clamp)
            const clampedX = Math.max(sRect.left, Math.min(sRect.right, e.clientX));
            const clampedY = Math.max(sRect.top, Math.min(sRect.bottom, e.clientY));

            const dispW = (miniSheet && miniSheet.offsetWidth > 0) ? miniSheet.offsetWidth : stageEl.offsetWidth;
            const dispH = (miniSheet && miniSheet.offsetHeight > 0) ? miniSheet.offsetHeight : stageEl.offsetHeight;

            const dx = clampedX - miniPanStartX;
            const dy = clampedY - miniPanStartY;
            const pctDx = (dx / dispW) * 100;
            const pctDy = (dy / dispH) * 100;

            const curIdx = docState.currentIndex;
            const cfg = getEffectiveItemSettings(curIdx);
            cfg.offsetX = Math.max(-50, Math.min(50, Math.round((miniPanStartOffsetX + pctDx) * 10) / 10));
            cfg.offsetY = Math.max(-50, Math.min(50, Math.round((miniPanStartOffsetY + pctDy) * 10) / 10));

            updateViewerEdits(curIdx);
            updateMiniPreview();
            if (isPerspectiveActive) updateCornerPins();
          }
          return;
        }

        if (!isPanning) return;
        e.preventDefault();

        const curIdx = docState.currentIndex;
        const cfg = getEffectiveItemSettings(curIdx);

        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;
        const rect = viewerWrap.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const pctDx = (dx / rect.width) * 100;
        const pctDy = (dy / rect.height) * 100;

        const nextX = Math.max(-50, Math.min(50, Math.round((panStartOffsetX + pctDx) * 10) / 10));
        const nextY = Math.max(-50, Math.min(50, Math.round((panStartOffsetY + pctDy) * 10) / 10));
        cfg.offsetX = nextX;
        cfg.offsetY = nextY;

        updateViewerEdits(curIdx);
        updateMiniPreview();
        if (isPerspectiveActive) updateCornerPins();
      });

      window.addEventListener('mouseup', () => {
        if (isPinDragging) {
          isPinDragging = false;
          isDraggingMiniPin = false;
          activeDraggingPinKey = null;
          const loupe = document.getElementById('miniPinLoupe');
          if (loupe) loupe.style.display = 'none';
          const viewerLoupe = document.getElementById('viewerPinLoupe');
          if (viewerLoupe) viewerLoupe.style.display = 'none';
        }
        if (isPanning) {
          isPanning = false;
          viewerWrap.style.cursor = 'grab';
          const mvc = document.getElementById('mainViewerCanvas');
          if (mvc) mvc.style.transition = 'transform 0.1s ease';
        }
        if (isMiniPanning) {
          isMiniPanning = false;
        }
      });

      // 터치 스크린 지원
      viewerWrap.addEventListener('touchstart', (e) => {
        const total = docState.items.length;
        if (total === 0) return;

        // 1. 투시 핀 터치 드래그 우선 처리
        const pinEl = e.target.closest('.corner-pin');
        if (pinEl && isPerspectiveActive) {
          e.preventDefault();
          e.stopPropagation();
          const cornerKey = pinEl.dataset.corner;
          selectCorner(cornerKey);
          isPinDragging = true;
          isDraggingMiniPin = false;
          activeDraggingPinKey = cornerKey;
          pinDragStartMouseX = e.touches[0].clientX;
          pinDragStartMouseY = e.touches[0].clientY;

          const curIdx = docState.currentIndex;
          const cfg = getEffectiveItemSettings(curIdx);
          if (!cfg.corners) {
            cfg.corners = { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } };
          }
          pinDragStartCornerVal = {
            x: cfg.corners[cornerKey]?.x || 0,
            y: cfg.corners[cornerKey]?.y || 0
          };
          updateViewerPinLoupe(cornerKey, e.touches[0].clientX, e.touches[0].clientY);
          return;
        }

        if (e.touches.length !== 1) return;

        isPanning = true;
        panStartX = e.touches[0].clientX;
        panStartY = e.touches[0].clientY;

        const curIdx = docState.currentIndex;
        const cfg = getEffectiveItemSettings(curIdx);
        panStartOffsetX = cfg.offsetX !== undefined ? cfg.offsetX : 0;
        panStartOffsetY = cfg.offsetY !== undefined ? cfg.offsetY : 0;

        const mvc = document.getElementById('mainViewerCanvas');
        if (mvc) mvc.style.transition = 'none';
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        // 투시 핀 터치 이동 (메인 뷰어 및 모바일 미니 프리뷰 양방향 터치 드래그 완벽 지원)
        if (isPinDragging && activeDraggingPinKey && e.touches.length > 0) {
          e.preventDefault();
          const canvas = document.getElementById('mainViewerCanvas');
          const curIdx = docState.currentIndex;
          const item = docState.items[curIdx];
          if (!canvas || !item || !item.imgObj || canvas.width === 0 || canvas.height === 0) return;

          const cfg = getEffectiveItemSettings(curIdx);
          const pts = getCornerCanvasPoints(item, cfg, canvas.width, canvas.height);
          if (!pts || !pts.dw || !pts.dh) return;

          if (isDraggingMiniPin) {
            const stageEl = document.getElementById('previewSheetStage');
            const miniSheet = document.getElementById('miniSheet');
            if (stageEl && miniSheet) {
              const sRect = stageEl.getBoundingClientRect();
              const stageX = e.touches[0].clientX - sRect.left;
              const stageY = e.touches[0].clientY - sRect.top;
              if (!cfg.corners) {
                cfg.corners = { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } };
              }
              cfg.corners[activeDraggingPinKey] = calcCornerFromMiniStagePos(pts, activeDraggingPinKey, stageX, stageY, miniSheet, stageEl, canvas);
            }
          } else {
            // 가운데 창(메인 뷰어): 용지 밖으로 자유롭게 핀 이동 지원 (캔버스 클램프 완전 제거)
            const dispW = canvas.clientWidth || canvas.offsetWidth;
            const dispH = canvas.clientHeight || canvas.offsetHeight;
            if (!dispW || !dispH) return;
            const scaleX = dispW / canvas.width;
            const scaleY = dispH / canvas.height;
            const zoom = docState.zoom || 1.0;
            const deltaScreenX = (e.touches[0].clientX - pinDragStartMouseX) / zoom;
            const deltaScreenY = (e.touches[0].clientY - pinDragStartMouseY) / zoom;

            const deltaCanvX = deltaScreenX / scaleX;
            const deltaCanvY = deltaScreenY / scaleY;

            const cos = Math.cos(-pts.rotRad);
            const sin = Math.sin(-pts.rotRad);
            const deltaLocalX = deltaCanvX * cos - deltaCanvY * sin;
            const deltaLocalY = deltaCanvX * sin + deltaCanvY * cos;

            const srcW = item.imgObj?.naturalWidth || item.imgObj?.width || pts.dw;
            const srcH = item.imgObj?.naturalHeight || item.imgObj?.height || pts.dh;
            const scalePxX = pts.dw / srcW;
            const scalePxY = pts.dh / srcH;

            // 원본 이미지 픽셀 단위로 환산
            const deltaOrigPxX = Math.round(deltaLocalX / scalePxX);
            const deltaOrigPxY = Math.round(deltaLocalY / scalePxY);

            if (!cfg.corners) {
              cfg.corners = { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } };
            }
            cfg.corners[activeDraggingPinKey] = {
              x: pinDragStartCornerVal.x + deltaOrigPxX,
              y: pinDragStartCornerVal.y + deltaOrigPxY
            };
          }

          updateViewerEdits(curIdx);
          updateMiniPreview();
          updateCornerPins();
          if (isDraggingMiniPin) {
            updateMiniPinLoupe(activeDraggingPinKey);
          } else {
            updateViewerPinLoupe(activeDraggingPinKey, e.touches[0].clientX, e.touches[0].clientY);
          }
          return;
        }

        if (isMiniPanning && e.touches.length === 1) {
          e.preventDefault();
          const miniSheet = document.getElementById('miniSheet');
          const stageEl = document.getElementById('previewSheetStage');
          if (stageEl) {
            const sRect = stageEl.getBoundingClientRect();
            // 손가락 터치 위치를 회색 박스(previewSheetStage) 내부로 엄격히 제한(Clamp)
            const clampedTouchX = Math.max(sRect.left, Math.min(sRect.right, e.touches[0].clientX));
            const clampedTouchY = Math.max(sRect.top, Math.min(sRect.bottom, e.touches[0].clientY));

            const dispW = (miniSheet && miniSheet.offsetWidth > 0) ? miniSheet.offsetWidth : stageEl.offsetWidth;
            const dispH = (miniSheet && miniSheet.offsetHeight > 0) ? miniSheet.offsetHeight : stageEl.offsetHeight;

            const dx = clampedTouchX - miniPanStartX;
            const dy = clampedTouchY - miniPanStartY;
            const pctDx = (dx / dispW) * 100;
            const pctDy = (dy / dispH) * 100;

            const curIdx = docState.currentIndex;
            const cfg = getEffectiveItemSettings(curIdx);
            cfg.offsetX = Math.max(-50, Math.min(50, Math.round((miniPanStartOffsetX + pctDx) * 10) / 10));
            cfg.offsetY = Math.max(-50, Math.min(50, Math.round((miniPanStartOffsetY + pctDy) * 10) / 10));

            updateViewerEdits(curIdx);
            updateMiniPreview();
            if (isPerspectiveActive) updateCornerPins();
          }
          return;
        }

        if (!isPanning || e.touches.length !== 1) return;
        const curIdx = docState.currentIndex;
        const cfg = getEffectiveItemSettings(curIdx);

        const dx = e.touches[0].clientX - panStartX;
        const dy = e.touches[0].clientY - panStartY;
        const rect = viewerWrap.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const pctDx = (dx / rect.width) * 100;
        const pctDy = (dy / rect.height) * 100;

        const nextX = Math.max(-50, Math.min(50, Math.round((panStartOffsetX + pctDx) * 10) / 10));
        const nextY = Math.max(-50, Math.min(50, Math.round((panStartOffsetY + pctDy) * 10) / 10));

        cfg.offsetX = nextX;
        cfg.offsetY = nextY;

        updateViewerEdits(curIdx);
        updateMiniPreview();
        if (isPerspectiveActive) updateCornerPins();
      }, { passive: false });

      window.addEventListener('touchend', () => {
        if (isPinDragging) {
          isPinDragging = false;
          isDraggingMiniPin = false;
          activeDraggingPinKey = null;
          const loupe = document.getElementById('miniPinLoupe');
          if (loupe) loupe.style.display = 'none';
          const viewerLoupe = document.getElementById('viewerPinLoupe');
          if (viewerLoupe) viewerLoupe.style.display = 'none';
        }
        if (isPanning) {
          isPanning = false;
          const mvc = document.getElementById('mainViewerCanvas');
          if (mvc) mvc.style.transition = 'transform 0.1s ease';
        }
        if (isMiniPanning) {
          isMiniPanning = false;
        }
      });

      window.addEventListener('touchcancel', () => {
        if (isPinDragging) {
          isPinDragging = false;
          isDraggingMiniPin = false;
          activeDraggingPinKey = null;
          const loupe = document.getElementById('miniPinLoupe');
          if (loupe) loupe.style.display = 'none';
          const viewerLoupe = document.getElementById('viewerPinLoupe');
          if (viewerLoupe) viewerLoupe.style.display = 'none';
        }
        if (isPanning) {
          isPanning = false;
          const mvc = document.getElementById('mainViewerCanvas');
          if (mvc) mvc.style.transition = 'transform 0.1s ease';
        }
        if (isMiniPanning) {
          isMiniPanning = false;
        }
      });
    }

    // 키보드 네비게이션 (상하좌우 이전/다음) 및 ESC 닫기
    window.addEventListener('keydown', (e) => {
      // 1. ESC 키: 팝업 모달, 햄버거 메뉴 및 모바일 패널 닫기 (최상위 레이어부터 순차 닫기)
      if (e.key === 'Escape') {
        const fileMgrModal = document.getElementById('modalOpenFilesManager');
        if (fileMgrModal && fileMgrModal.classList.contains('show')) {
          closeOpenFilesManagerModal(true);
          return;
        }
        const pickerModal = document.getElementById('modalPdfPicker');
        if (pickerModal && pickerModal.classList.contains('show')) {
          closePdfPickerModal(true);
          return;
        }
        const modal = document.getElementById('modalGlobalSettings');
        if (modal && modal.classList.contains('show')) {
          closeGlobalSettingsModal(true);
          return;
        }
        const menu = document.getElementById('menuDropdown');
        if (menu && menu.classList.contains('show')) {
          closeMenuDropdown();
          return;
        }
        const col = document.getElementById('colControl');
        if (col && col.classList.contains('mobile-open')) {
          toggleMobileControl(false, true);
          return;
        }

        // 모든 레이어가 닫힌 메인 화면 상태에서 ESC: 2초 내 2회 입력 시 종료
        const now = Date.now();
        if (now - lastBackPressTime < 2000) {
          exitApp();
        } else {
          lastBackPressTime = now;
          const msg = hasActiveWork()
            ? "저장되지 않은 작업이 있습니다. ESC 키를 한 번 더 누르면 종료됩니다."
            : "ESC 키를 한 번 더 누르면 종료됩니다.";
          showExitToast(msg);
        }
        return;
      }

      // 입력 중일 때는 화살표 탐색 스킵
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'select' || activeTag === 'textarea') {
        return;
      }

      // 2. 키보드 화살표 네비게이션
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateViewer(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigateViewer(1);
      }
    });

    // 브라우저 뒤로가기(하드웨어/제스처) 시 열려 있는 레이어 닫기 및 2회 터치 시 앱 종료
    window.addEventListener('popstate', (e) => {
      if (isAppExiting) return;
      if (isClosingLayerProgrammatically) {
        isClosingLayerProgrammatically = false;
        return;
      }

      // 0. 열린 파일 관리 모달 닫기
      const fileMgrModal = document.getElementById('modalOpenFilesManager');
      if (fileMgrModal && fileMgrModal.classList.contains('show')) {
        closeOpenFilesManagerModal(false);
        return;
      }

      // 1. PDF 페이지 선택 피커 닫기
      const pickerModal = document.getElementById('modalPdfPicker');
      if (pickerModal && pickerModal.classList.contains('show')) {
        closePdfPickerModal(false);
        return;
      }

      // 2. 글로벌 기본 설정 모달 닫기
      const modal = document.getElementById('modalGlobalSettings');
      if (modal && modal.classList.contains('show')) {
        closeGlobalSettingsModal(false);
        return;
      }

      // 3. 햄버거 메뉴 닫기
      const menu = document.getElementById('menuDropdown');
      if (menu && menu.classList.contains('show')) {
        closeMenuDropdown();
        try { history.pushState({ pixpdfRoot: true }, ''); } catch (err) {}
        return;
      }

      // 4. 모바일 편집창 닫기 (메인 썸네일/뷰어 화면으로 복귀)
      const col = document.getElementById('colControl');
      if (col && col.classList.contains('mobile-open')) {
        toggleMobileControl(false, false);
        return;
      }

      // 5. 모든 레이어가 닫힌 메인 화면 상태에서 뒤로가기가 발생한 경우: 2초 내 2회 터치 시 앱 종료
      const now = Date.now();
      if (now - lastBackPressTime < 2000) {
        // 2초 내 2번째 누름: 컨펌 팝업 없이 즉시 종료
        exitApp();
      } else {
        // 1번째 누름: 토스트 안내 띄우고 히스토리 가로채기 유지
        lastBackPressTime = now;
        try {
          history.pushState({ pixpdfRoot: true }, '');
        } catch (err) {}
        const msg = hasActiveWork()
          ? "저장되지 않은 작업이 있습니다. '뒤로' 버튼을 한 번 더 누르면 종료됩니다."
          : "'뒤로' 버튼을 한 번 더 누르면 종료됩니다.";
        showExitToast(msg);
      }
    });

    // 브라우저 새로고침(F5, 풀다운 새로고침) 및 탭 닫기 시 작업 보호
    window.addEventListener('beforeunload', (e) => {
      if (hasActiveWork() && !isAppExiting) {
        e.preventDefault();
        e.returnValue = '저장하지 않은 내용은 복구되지 않습니다. 정말 종료하시겠습니까?';
        return e.returnValue;
      }
    });

    // 화면 리사이즈 시 활성화된 투시 변환 핀 위치 재계산
    window.addEventListener('resize', () => {
      if (isPerspectiveActive) {
        updateCornerPins();
      }
    });

    // 초기 워크스페이스 상태 초기화 및 히스토리 앵커 수립
    initHistoryAnchor();
    const initFileInput = document.getElementById('fileInput');
    if (initFileInput) initFileInput.value = '';
    const initInsertInput = document.getElementById('insertFileInput');
    if (initInsertInput) initInsertInput.value = '';
    refreshWorkspaceDisplay();
