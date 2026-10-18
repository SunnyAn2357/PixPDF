    function getCornerCanvasPoints(item, cfg, canvasW, canvasH) {
      if (!item || !item.imgObj) return null;
      const { rotImg, isPageRot90, isImgRot90 } = getResolvedRotations(cfg);
      const rotRad = (rotImg * Math.PI) / 180;

      const origW = item.width || item.imgObj.width;
      const origH = item.height || item.imgObj.height;
      const rotImgW = isImgRot90 ? origH : origW;
      const rotImgH = isImgRot90 ? origW : origH;

      const isOrigLandscape = (origW > origH);
      const orientOpt = cfg.orient || 'auto';
      const baseLandscape = orientOpt === 'l' || (orientOpt === 'auto' && isOrigLandscape);
      const isLandscape = isPageRot90 ? !baseLandscape : baseLandscape;
      const marginPx = cfg.margin || 0;
      const sizeKey = cfg.pageSize || cfg.fit || 'original';

      // [핵심 무결성] 용지 규격은 페이지 회전(rotPage / isPageRot90)과 방향(orient)에 의해서만 결정되며
      // 내용물인 이미지 자체의 회전(rotImg)에 의해 바탕 용지가 회전되는 일이 원천 차단됩니다.
      const basePaperW = (isPageRot90 ? origH : origW) + marginPx * 2;
      const basePaperH = (isPageRot90 ? origW : origH) + marginPx * 2;
      const paper = resolvePaperGeometry(sizeKey, isLandscape, basePaperW, basePaperH, cfg.customW, cfg.customH);

      const scaleFactor = canvasW / paper.widthPx;
      const viewMargin = Math.round(marginPx * scaleFactor);
      const innerW = Math.max(10, canvasW - (viewMargin * 2));
      const innerH = Math.max(10, canvasH - (viewMargin * 2));

      const fitScale = Math.min(innerW / rotImgW, innerH / rotImgH);
      const baseDrawW = rotImgW * fitScale;
      const baseDrawH = rotImgH * fitScale;

      const cScale = cfg.contentScale || 1.0;
      const scaleX = cfg.scaleX !== undefined ? cfg.scaleX : 1.0;
      const finalW = baseDrawW * cScale * scaleX;
      const finalH = baseDrawH * cScale;

      const shiftX = canvasW * ((cfg.offsetX || 0) / 100);
      const shiftY = canvasH * ((cfg.offsetY || 0) / 100);
      const posX = (canvasW - finalW) / 2 + shiftX;
      const posY = (canvasH - finalH) / 2 + shiftY;

      const origDrawW = isImgRot90 ? (baseDrawH * cScale) : (baseDrawW * cScale * scaleX);
      const origDrawH = isImgRot90 ? (baseDrawW * cScale * scaleX) : (baseDrawH * cScale);

      const dx = -origDrawW / 2;
      const dy = -origDrawH / 2;
      const dw = origDrawW;
      const dh = origDrawH;

      const trap = cfg.trapezoid || 0;
      const trapTopOffset = trap > 0 ? (dw * trap) / 2 : 0;
      const trapBotOffset = trap < 0 ? (dw * Math.abs(trap)) / 2 : 0;

      const srcW = item.imgObj.naturalWidth || item.imgObj.width || dw;
      const srcH = item.imgObj.naturalHeight || item.imgObj.height || dh;
      const scalePxX = dw / srcW;
      const scalePxY = dh / srcH;

      const c = cfg.corners || { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } };

      const pLocal = {
        tl: {
          x: dx - trapTopOffset + ((c.tl?.x || 0) * scalePxX),
          y: dy + ((c.tl?.y || 0) * scalePxY)
        },
        tr: {
          x: dx + dw + trapTopOffset + ((c.tr?.x || 0) * scalePxX),
          y: dy + ((c.tr?.y || 0) * scalePxY)
        },
        br: {
          x: dx + dw + trapBotOffset + ((c.br?.x || 0) * scalePxX),
          y: dy + dh + ((c.br?.y || 0) * scalePxY)
        },
        bl: {
          x: dx - trapBotOffset + ((c.bl?.x || 0) * scalePxX),
          y: dy + dh + ((c.bl?.y || 0) * scalePxY)
        }
      };

      const cx = posX + finalW / 2;
      const cy = posY + finalH / 2;
      const cos = Math.cos(rotRad);
      const sin = Math.sin(rotRad);

      function toCanv(pt) {
        return {
          x: cx + (pt.x * cos - pt.y * sin),
          y: cy + (pt.x * sin + pt.y * cos)
        };
      }

      return {
        tl: toCanv(pLocal.tl),
        tr: toCanv(pLocal.tr),
        br: toCanv(pLocal.br),
        bl: toCanv(pLocal.bl),
        baseLocal: {
          tl: { x: dx - trapTopOffset, y: dy },
          tr: { x: dx + dw + trapTopOffset, y: dy },
          br: { x: dx + dw + trapBotOffset, y: dy + dh },
          bl: { x: dx - trapBotOffset, y: dy + dh }
        },
        scalePxX,
        scalePxY,
        dw,
        dh,
        cx,
        cy,
        rotRad
      };
    }

    // 미니 프리뷰 스테이지(회색 박스) 좌표로부터 투시 모서리 좌표 역산 (스테이지 테두리 밖 이탈 원천 방어)
    function calcCornerFromMiniStagePos(pts, cornerKey, stageX, stageY, miniSheet, stageEl, canvas) {
      if (!pts || !pts.baseLocal || !pts.baseLocal[cornerKey]) return { x: 0, y: 0 };
      const pinPad = 11;
      const stageW = stageEl ? stageEl.offsetWidth : 150;
      const stageH = stageEl ? stageEl.offsetHeight : 180;
      const clampedX = Math.max(pinPad, Math.min(stageW - pinPad, stageX));
      const clampedY = Math.max(pinPad, Math.min(stageH - pinPad, stageY));

      const mScaleX = miniSheet.offsetWidth / canvas.width;
      const mScaleY = miniSheet.offsetHeight / canvas.height;
      const offX = miniSheet.offsetLeft;
      const offY = miniSheet.offsetTop;

      const canvX = (clampedX - offX) / mScaleX;
      const canvY = (clampedY - offY) / mScaleY;

      const cos = Math.cos(-pts.rotRad);
      const sin = Math.sin(-pts.rotRad);
      const dCanvX = canvX - pts.cx;
      const dCanvY = canvY - pts.cy;
      const localX = dCanvX * cos - dCanvY * sin;
      const localY = dCanvX * sin + dCanvY * cos;
      const base = pts.baseLocal[cornerKey];

      return {
        x: Math.round((localX - base.x) / pts.scalePxX),
        y: Math.round((localY - base.y) / pts.scalePxY)
      };
    }

    // 메인 뷰어 및 우측/모바일 미니 프리뷰의 4개 핀 핸들과 SVG 가이드 다각형 위치 실시간 동기화
    function updateCornerPins() {
      const overlay = document.getElementById('perspectiveOverlay');
      const miniOverlay = document.getElementById('miniPerspectiveOverlay');

      if (!isPerspectiveActive) {
        if (overlay) overlay.style.display = 'none';
        if (miniOverlay) miniOverlay.style.display = 'none';
        return;
      }

      const canvas = document.getElementById('mainViewerCanvas');
      const curIdx = docState.currentIndex;
      const item = docState.items[curIdx];
      if (!canvas || !item || !item.imgObj || canvas.width === 0 || canvas.height === 0) {
        if (overlay) overlay.style.display = 'none';
        if (miniOverlay) miniOverlay.style.display = 'none';
        return;
      }

      const cfg = getEffectiveItemSettings(curIdx);
      const pts = getCornerCanvasPoints(item, cfg, canvas.width, canvas.height);
      if (!pts) {
        if (overlay) overlay.style.display = 'none';
        if (miniOverlay) miniOverlay.style.display = 'none';
        return;
      }

      // 1. 가운데 메인 뷰어 핀 & 다각형 위치 동기화
      if (overlay) {
        overlay.style.display = 'block';
        const dispW = canvas.clientWidth || canvas.offsetWidth;
        const dispH = canvas.clientHeight || canvas.offsetHeight;
        if (dispW && dispH) {
          const scaleX = dispW / canvas.width;
          const scaleY = dispH / canvas.height;

          const sTL = { x: pts.tl.x * scaleX, y: pts.tl.y * scaleY };
          const sTR = { x: pts.tr.x * scaleX, y: pts.tr.y * scaleY };
          const sBR = { x: pts.br.x * scaleX, y: pts.br.y * scaleY };
          const sBL = { x: pts.bl.x * scaleX, y: pts.bl.y * scaleY };

          const poly = document.getElementById('perspectivePolygon');
          if (poly) {
            poly.setAttribute('points', `${sTL.x},${sTL.y} ${sTR.x},${sTR.y} ${sBR.x},${sBR.y} ${sBL.x},${sBL.y}`);
          }

          const pinTL = document.getElementById('pinTL');
          const pinTR = document.getElementById('pinTR');
          const pinBR = document.getElementById('pinBR');
          const pinBL = document.getElementById('pinBL');

          if (pinTL) { pinTL.style.left = `${sTL.x}px`; pinTL.style.top = `${sTL.y}px`; }
          if (pinTR) { pinTR.style.left = `${sTR.x}px`; pinTR.style.top = `${sTR.y}px`; }
          if (pinBR) { pinBR.style.left = `${sBR.x}px`; pinBR.style.top = `${sBR.y}px`; }
          if (pinBL) { pinBL.style.left = `${sBL.x}px`; pinBL.style.top = `${sBL.y}px`; }
        }
      }

      // 2. 우측/모바일 미니 프리뷰 핀 & 다각형 위치 동기화 (종이 밖 회색 스테이지 영역까지 노출 및 경계 이탈 방지 클램프)
      if (miniOverlay) {
        const miniSheet = document.getElementById('miniSheet');
        const stageEl = document.getElementById('previewSheetStage') || miniSheet?.parentElement;
        if (miniSheet && stageEl && miniSheet.offsetWidth > 0 && miniSheet.offsetHeight > 0) {
          miniOverlay.style.display = 'block';
          const stageW = stageEl.offsetWidth;
          const stageH = stageEl.offsetHeight;

          const mScaleX = miniSheet.offsetWidth / canvas.width;
          const mScaleY = miniSheet.offsetHeight / canvas.height;
          const offX = miniSheet.offsetLeft;
          const offY = miniSheet.offsetTop;

          // 핀 반경(11px) 여유를 두어 회색 스테이지 박스 테두리 밖으로 핀이 절대 탈출하거나 사라지지 않게 클램프(Clamp)
          const pinPad = 11;
          function clampToStage(pt) {
            const rawX = offX + pt.x * mScaleX;
            const rawY = offY + pt.y * mScaleY;
            return {
              x: Math.max(pinPad, Math.min(stageW - pinPad, rawX)),
              y: Math.max(pinPad, Math.min(stageH - pinPad, rawY))
            };
          }

          const mTL = clampToStage(pts.tl);
          const mTR = clampToStage(pts.tr);
          const mBR = clampToStage(pts.br);
          const mBL = clampToStage(pts.bl);

          const miniPoly = document.getElementById('miniPerspectivePolygon');
          if (miniPoly) {
            miniPoly.setAttribute('points', `${mTL.x},${mTL.y} ${mTR.x},${mTR.y} ${mBR.x},${mBR.y} ${mBL.x},${mBL.y}`);
          }

          const miniPinTL = document.getElementById('miniPinTL');
          const miniPinTR = document.getElementById('miniPinTR');
          const miniPinBR = document.getElementById('miniPinBR');
          const miniPinBL = document.getElementById('miniPinBL');

          if (miniPinTL) { miniPinTL.style.left = `${mTL.x}px`; miniPinTL.style.top = `${mTL.y}px`; }
          if (miniPinTR) { miniPinTR.style.left = `${mTR.x}px`; miniPinTR.style.top = `${mTR.y}px`; }
          if (miniPinBR) { miniPinBR.style.left = `${mBR.x}px`; miniPinBR.style.top = `${mBR.y}px`; }
          if (miniPinBL) { miniPinBL.style.left = `${mBL.x}px`; miniPinBL.style.top = `${mBL.y}px`; }
        } else {
          miniOverlay.style.display = 'none';
        }
      }

      document.querySelectorAll('.corner-pin').forEach(pin => {
        pin.classList.toggle('active', pin.dataset.corner === selectedCornerKey);
      });
    }

    // 현재 선택된 페이지의 투시 변환 UI 동기화 (페이지별 독립 활성화 상태 보장)
    function syncPerspectiveUI(active) {
      const prevActive = isPerspectiveActive;
      isPerspectiveActive = Boolean(active);
      const overlay = document.getElementById('perspectiveOverlay');
      const miniOverlay = document.getElementById('miniPerspectiveOverlay');
      const btnToggle = document.getElementById('btnTogglePerspective');

      if (overlay) overlay.style.display = isPerspectiveActive ? 'block' : 'none';
      if (miniOverlay) miniOverlay.style.display = isPerspectiveActive ? 'block' : 'none';
      if (btnToggle) {
        btnToggle.classList.toggle('active', isPerspectiveActive);
        btnToggle.style.background = isPerspectiveActive ? '#0f766e' : '';
        btnToggle.style.color = isPerspectiveActive ? '#ffffff' : '';
      }

      // 가운데 창 투시변환 켤 때 이미지와 용지 전체 자동 축소 (약 25% 축소 / 0.75배) 및 끌 때 원래 배율로 복원
      if (isPerspectiveActive && !prevActive) {
        if (docState.savedZoomBeforePerspective === undefined || docState.savedZoomBeforePerspective === null) {
          docState.savedZoomBeforePerspective = docState.zoom;
          docState.zoom = Math.max(0.3, Math.round(docState.zoom * 0.75 * 100) / 100);
          applyZoom();
        }
      } else if (!isPerspectiveActive && prevActive) {
        if (docState.savedZoomBeforePerspective !== undefined && docState.savedZoomBeforePerspective !== null) {
          docState.zoom = docState.savedZoomBeforePerspective;
          docState.savedZoomBeforePerspective = null;
          applyZoom();
        }
      }

      if (isPerspectiveActive) {
        updateCornerPins();
      } else {
        selectedCornerKey = null;
        document.querySelectorAll('.corner-pin').forEach(p => p.classList.remove('active'));
        const loupe = document.getElementById('miniPinLoupe');
        if (loupe) loupe.style.display = 'none';
        const viewerLoupe = document.getElementById('viewerPinLoupe');
        if (viewerLoupe) viewerLoupe.style.display = 'none';
      }
    }

    // 돋보기 투명 배경용 체커보드 패턴 렌더링 헬퍼
    function drawLoupeCheckerboard(ctx, x, y, w, h, size = 6) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#e2e8f0';
      const startCol = Math.floor(x / size);
      const endCol = Math.ceil((x + w) / size);
      const startRow = Math.floor(y / size);
      const endRow = Math.ceil((y + h) / size);
      for (let r = startRow; r < endRow; r++) {
        for (let c = startCol; c < endCol; c++) {
          if ((r + c) % 2 === 1) {
            ctx.fillRect(c * size, r * size, size, size);
          }
        }
      }
      ctx.restore();
    }

    // 돋보기 공통 정밀 조준 십자선 (Crosshair) 렌더링 헬퍼
    function drawLoupeCrosshair(lctx, cx, cy, chLen = 14) {
      // 1. 흰색 외곽 후광 (어두운 이미지 또는 밝은 종이 위에서도 항상 선명)
      lctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      lctx.lineWidth = 3.2;
      lctx.beginPath();
      lctx.moveTo(cx, cy - chLen); lctx.lineTo(cx, cy + chLen);
      lctx.moveTo(cx - chLen, cy); lctx.lineTo(cx + chLen, cy);
      lctx.stroke();

      lctx.beginPath();
      lctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
      lctx.stroke();

      // 2. 중심 조준선 및 링 (PixPDF 브랜드 틸 그린)
      lctx.strokeStyle = '#0f766e';
      lctx.lineWidth = 1.6;
      lctx.beginPath();
      lctx.moveTo(cx, cy - chLen); lctx.lineTo(cx, cy + chLen);
      lctx.moveTo(cx - chLen, cy); lctx.lineTo(cx + chLen, cy);
      lctx.stroke();

      lctx.beginPath();
      lctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
      lctx.stroke();

      // 3. 중심 정밀 타겟 점
      lctx.fillStyle = '#0f766e';
      lctx.beginPath();
      lctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
      lctx.fill();
    }

    // 모바일/우측 미니 프리뷰 투시 핀 드래그 시 정밀 확대 돋보기(Loupe) - 용지 외곽선/모서리 동시 표출
    function updateMiniPinLoupe(pinKey) {
      if (!isDraggingMiniPin || !pinKey) return;
      const loupe = document.getElementById('miniPinLoupe');
      const loupeCanvas = document.getElementById('miniLoupeCanvas');
      const miniCanvas = document.getElementById('miniCanvas');
      const miniSheet = document.getElementById('miniSheet');
      const stageEl = document.getElementById('previewSheetStage');
      const pinEl = document.getElementById('miniPin' + pinKey.toUpperCase());
      if (!loupe || !loupeCanvas || !miniCanvas || !miniSheet || !stageEl || !pinEl) return;

      const pinX = parseFloat(pinEl.style.left) || 0;
      const pinY = parseFloat(pinEl.style.top) || 0;
      const loupeSize = 100;

      // 핀 바로 위에 돋보기 배치 (상단 경계 침범 시 아래쪽에 배치)
      let loupeX = pinX - loupeSize / 2;
      let loupeY = pinY - loupeSize - 18;
      if (loupeY < 4) {
        loupeY = pinY + 22;
      }
      loupeX = Math.max(4, Math.min(stageEl.offsetWidth - loupeSize - 4, loupeX));

      loupe.style.left = `${loupeX}px`;
      loupe.style.top = `${loupeY}px`;
      loupe.style.display = 'block';

      // Retina / HiDPI 버퍼
      const dpr = Math.max(2, window.devicePixelRatio || 2);
      const bufSize = Math.round(loupeSize * dpr);
      if (loupeCanvas.width !== bufSize || loupeCanvas.height !== bufSize) {
        loupeCanvas.width = bufSize;
        loupeCanvas.height = bufSize;
      }

      const lctx = loupeCanvas.getContext('2d');
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, bufSize, bufSize);
      lctx.scale(dpr, dpr);

      // 원형 클리핑
      lctx.save();
      const cx = loupeSize / 2;
      const cy = loupeSize / 2;
      lctx.beginPath();
      lctx.arc(cx, cy, cx - 1, 0, Math.PI * 2);
      lctx.clip();

      // 1. 용지 바깥 회색 스테이지 배경 (Outside Workspace)
      lctx.fillStyle = '#e2e8f0';
      lctx.fillRect(0, 0, loupeSize, loupeSize);

      // 2. 종이 용지(Paper) 치수 및 돋보기 내 좌표 계산 (2.4배 확대)
      const zoom = 2.4;
      const paperX = miniSheet.offsetLeft;
      const paperY = miniSheet.offsetTop;
      const paperW = miniSheet.offsetWidth;
      const paperH = miniSheet.offsetHeight;

      const pInLoupeX = (paperX - pinX) * zoom + cx;
      const pInLoupeY = (paperY - pinY) * zoom + cy;
      const pInLoupeW = paperW * zoom;
      const pInLoupeH = paperH * zoom;

      // 3. 종이 용지 바탕 (그림자 및 흰색/투명 배경)
      lctx.save();
      lctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
      lctx.shadowBlur = Math.round(6 * zoom);
      lctx.fillStyle = '#ffffff';
      lctx.fillRect(pInLoupeX, pInLoupeY, pInLoupeW, pInLoupeH);
      lctx.restore();

      const isTrans = miniSheet.classList.contains('checkerboard-bg');
      if (isTrans) {
        drawLoupeCheckerboard(lctx, pInLoupeX, pInLoupeY, pInLoupeW, pInLoupeH, 6);
      }

      // 4. 고화질 메인 캔버스(또는 미니 캔버스)의 이미지 내용물 렌더링
      const srcCanvas = document.getElementById('mainViewerCanvas') || miniCanvas;
      if (srcCanvas && srcCanvas.width > 0 && srcCanvas.height > 0) {
        lctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, pInLoupeX, pInLoupeY, pInLoupeW, pInLoupeH);
      }

      // 5. [핵심] 종이 용지 외곽 테두리선(Paper Boundary) 및 4개 모서리(Corners) 강조
      lctx.strokeStyle = '#0f766e';
      lctx.lineWidth = 1.6;
      lctx.strokeRect(pInLoupeX, pInLoupeY, pInLoupeW, pInLoupeH);

      // 용지 4개 모서리 L자형 직각 가이드
      const arm = Math.min(12, Math.min(pInLoupeW, pInLoupeH) * 0.2);
      lctx.strokeStyle = '#047857';
      lctx.lineWidth = 2.5;
      lctx.beginPath();
      // TL
      lctx.moveTo(pInLoupeX, pInLoupeY + arm); lctx.lineTo(pInLoupeX, pInLoupeY); lctx.lineTo(pInLoupeX + arm, pInLoupeY);
      // TR
      lctx.moveTo(pInLoupeX + pInLoupeW - arm, pInLoupeY); lctx.lineTo(pInLoupeX + pInLoupeW, pInLoupeY); lctx.lineTo(pInLoupeX + pInLoupeW, pInLoupeY + arm);
      // BR
      lctx.moveTo(pInLoupeX + pInLoupeW, pInLoupeY + pInLoupeH - arm); lctx.lineTo(pInLoupeX + pInLoupeW, pInLoupeY + pInLoupeH); lctx.lineTo(pInLoupeX + pInLoupeW - arm, pInLoupeY + pInLoupeH);
      // BL
      lctx.moveTo(pInLoupeX + arm, pInLoupeY + pInLoupeH); lctx.lineTo(pInLoupeX, pInLoupeY + pInLoupeH); lctx.lineTo(pInLoupeX, pInLoupeY + pInLoupeH - arm);
      lctx.stroke();

      lctx.restore();
    }

    // 중앙 메인 뷰어 투시 핀 드래그 시 정밀 확대 돋보기(Loupe) - 용지 외곽선/모서리 동시 표출 (중심 십자선 없이 시원한 시야 확보)
    function updateViewerPinLoupe(pinKey, mouseX, mouseY) {
      if (!isPinDragging || isDraggingMiniPin || !pinKey) return;
      const loupe = document.getElementById('viewerPinLoupe');
      const loupeCanvas = document.getElementById('viewerLoupeCanvas');
      const canvas = document.getElementById('mainViewerCanvas');
      const wrap = document.getElementById('viewerWrap');
      const viewport = document.getElementById('viewerViewport');
      const pinEl = document.getElementById('pin' + pinKey.toUpperCase());
      if (!loupe || !loupeCanvas || !canvas || !wrap || !viewport || !pinEl) return;

      const loupeSize = 110;
      const vpRect = viewport.getBoundingClientRect();
      const pinRect = pinEl.getBoundingClientRect();
      const pinCenterX = pinRect.left + pinRect.width / 2;
      const pinCenterY = pinRect.top + pinRect.height / 2;

      // 돋보기 위치 계산 (핀 바로 위에 부유, 상단 침범 시 아래에 배치)
      const relX = pinCenterX - vpRect.left;
      const relY = pinCenterY - vpRect.top;
      let loupeX = relX - loupeSize / 2;
      let loupeY = relY - loupeSize - 22;
      if (loupeY < 8) {
        loupeY = relY + 26;
      }
      loupeX = Math.max(8, Math.min(vpRect.width - loupeSize - 8, loupeX));

      loupe.style.left = `${loupeX + viewport.scrollLeft}px`;
      loupe.style.top = `${loupeY + viewport.scrollTop}px`;
      loupe.style.display = 'block';

      // Retina / HiDPI 버퍼
      const dpr = Math.max(2, window.devicePixelRatio || 2);
      const bufSize = Math.round(loupeSize * dpr);
      if (loupeCanvas.width !== bufSize || loupeCanvas.height !== bufSize) {
        loupeCanvas.width = bufSize;
        loupeCanvas.height = bufSize;
      }

      const lctx = loupeCanvas.getContext('2d');
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, bufSize, bufSize);
      lctx.scale(dpr, dpr);

      // 원형 클리핑
      lctx.save();
      const cx = loupeSize / 2;
      const cy = loupeSize / 2;
      lctx.beginPath();
      lctx.arc(cx, cy, cx - 1, 0, Math.PI * 2);
      lctx.clip();

      // 1. 용지 바깥 뷰포트 배경 (Outside Workspace)
      lctx.fillStyle = '#e2e8f0';
      lctx.fillRect(0, 0, loupeSize, loupeSize);

      // 2. 메인 뷰어 내 핀 좌표 및 용지 치수 (2.2배 확대)
      const pinX = parseFloat(pinEl.style.left) || 0;
      const pinY = parseFloat(pinEl.style.top) || 0;
      const paperW = canvas.clientWidth || canvas.offsetWidth;
      const paperH = canvas.clientHeight || canvas.offsetHeight;
      const zoom = 2.2;

      const pInLoupeX = (0 - pinX) * zoom + cx;
      const pInLoupeY = (0 - pinY) * zoom + cy;
      const pInLoupeW = paperW * zoom;
      const pInLoupeH = paperH * zoom;

      // 3. 종이 용지 바탕 (그림자 및 흰색/투명 배경)
      lctx.save();
      lctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
      lctx.shadowBlur = Math.round(6 * zoom);
      lctx.fillStyle = '#ffffff';
      lctx.fillRect(pInLoupeX, pInLoupeY, pInLoupeW, pInLoupeH);
      lctx.restore();

      const isTrans = wrap.classList.contains('checkerboard-bg');
      if (isTrans) {
        drawLoupeCheckerboard(lctx, pInLoupeX, pInLoupeY, pInLoupeW, pInLoupeH, 7);
      }

      // 4. 고해상도 메인 뷰어 캔버스 내용물 렌더링
      if (canvas.width > 0 && canvas.height > 0) {
        lctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, pInLoupeX, pInLoupeY, pInLoupeW, pInLoupeH);
      }

      // 5. [핵심] 종이 용지 외곽 테두리선(Paper Boundary) 및 4개 모서리(Corners) 강조
      lctx.strokeStyle = '#0f766e';
      lctx.lineWidth = 1.6;
      lctx.strokeRect(pInLoupeX, pInLoupeY, pInLoupeW, pInLoupeH);

      // 용지 4개 모서리 L자형 직각 가이드
      const arm = Math.min(14, Math.min(pInLoupeW, pInLoupeH) * 0.2);
      lctx.strokeStyle = '#047857';
      lctx.lineWidth = 2.5;
      lctx.beginPath();
      // TL
      lctx.moveTo(pInLoupeX, pInLoupeY + arm); lctx.lineTo(pInLoupeX, pInLoupeY); lctx.lineTo(pInLoupeX + arm, pInLoupeY);
      // TR
      lctx.moveTo(pInLoupeX + pInLoupeW - arm, pInLoupeY); lctx.lineTo(pInLoupeX + pInLoupeW, pInLoupeY); lctx.lineTo(pInLoupeX + pInLoupeW, pInLoupeY + arm);
      // BR
      lctx.moveTo(pInLoupeX + pInLoupeW, pInLoupeY + pInLoupeH - arm); lctx.lineTo(pInLoupeX + pInLoupeW, pInLoupeY + pInLoupeH); lctx.lineTo(pInLoupeX + pInLoupeW - arm, pInLoupeY + pInLoupeH);
      // BL
      lctx.moveTo(pInLoupeX + arm, pInLoupeY + pInLoupeH); lctx.lineTo(pInLoupeX, pInLoupeY + pInLoupeH); lctx.lineTo(pInLoupeX, pInLoupeY + pInLoupeH - arm);
      lctx.stroke();

      lctx.restore();
    }

    // 투시 변환 모드 온/오프 토글 (현재 페이지에만 독립 적용)
    function togglePerspectiveMode() {
      const curIdx = docState.currentIndex;
      const item = docState.items[curIdx];
      if (!item) return;
      const cfg = getEffectiveItemSettings(curIdx);
      cfg.isPerspectiveActive = !cfg.isPerspectiveActive;
      syncPerspectiveUI(cfg.isPerspectiveActive);
      updateMiniPreview();
      updateCornerPins();

      // 시트 크기 전환 애니메이션(220ms) 종료 후 핀 위치 최종 보정 동기화
      setTimeout(() => {
        if (isPerspectiveActive) {
          updateCornerPins();
        }
      }, 230);
    }

    // 모서리 핀 선택 (D-Pad 및 시각 강조 연동)
    function selectCorner(key) {
      selectedCornerKey = key;
      ['tl', 'tr', 'bl', 'br'].forEach(k => {
        const pin = document.getElementById('pin' + k.toUpperCase());
        if (pin) pin.classList.toggle('active', k === key);
        const miniPin = document.getElementById('miniPin' + k.toUpperCase());
        if (miniPin) miniPin.classList.toggle('active', k === key);
      });
    }

    // 모서리 핀 좌표 초기화 (0% 0%)
    async function resetCorners() {
      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      cfg.corners = {
        tl: { x: 0, y: 0 },
        tr: { x: 0, y: 0 },
        br: { x: 0, y: 0 },
        bl: { x: 0, y: 0 }
      };
      await updateViewerEdits(curIdx);
      updateMiniPreview();
      if (isPerspectiveActive) {
        updateCornerPins();
      }
    }

    function adjustImageOffset(pixelDx, pixelDy) {
      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      const curX = cfg.offsetX !== undefined ? cfg.offsetX : 0;
      const curY = cfg.offsetY !== undefined ? cfg.offsetY : 0;
      const mainCanvas = document.getElementById('mainViewerCanvas');
      const canvasW = (mainCanvas && mainCanvas.width) ? mainCanvas.width : 1200;
      const canvasH = (mainCanvas && mainCanvas.height) ? mainCanvas.height : 1200;
      const pctStepX = (pixelDx / canvasW) * 100;
      const pctStepY = (pixelDy / canvasH) * 100;
      cfg.offsetX = Math.max(-50, Math.min(50, Math.round((curX + pctStepX) * 1000) / 1000));
      cfg.offsetY = Math.max(-50, Math.min(50, Math.round((curY + pctStepY) * 1000) / 1000));
      updateViewerEdits();
      updateMiniPreview();
      if (isPerspectiveActive) updateCornerPins();
    }

    function resetImageOffset() {
      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      cfg.offsetX = 0;
      cfg.offsetY = 0;
      updateViewerEdits();
      updateMiniPreview();
      if (isPerspectiveActive) updateCornerPins();
    }

    // [핵심] 정해진 용지 크기를 고정 유지하고 내부 내용물만 확대/축소/비율/필터/오프셋 편집
    // 3열 우측 '미리보기 / 이미지 편집' 창: 2열 메인 뷰어와 100% WYSIWYG 일체화 동기화
    function updateMiniPreview() {
      const miniCanvas = document.getElementById('miniCanvas');
      if (!miniCanvas) return;
      const mctx = miniCanvas.getContext('2d');
      const miniSheet = document.getElementById('miniSheet');
      const miniEmpty = document.getElementById('miniEmpty');
      const info = document.getElementById('miniInfo');

      const srcCanvas = document.getElementById('mainViewerCanvas');
      if (!srcCanvas || srcCanvas.width === 0 || srcCanvas.height === 0) {
        if (miniSheet) miniSheet.style.display = 'none';
        if (miniEmpty) miniEmpty.style.display = 'flex';
        if (info) info.textContent = '선택 항목 기준 윤곽';
        return;
      }

      if (miniSheet) miniSheet.style.display = 'block';
      if (miniEmpty) miniEmpty.style.display = 'none';

      const stageEl = document.getElementById('previewSheetStage');
      const stageW = (stageEl && stageEl.clientWidth > 0) ? stageEl.clientWidth : 140;
      const stageH = (stageEl && stageEl.clientHeight > 0) ? stageEl.clientHeight : 180;

      // [스마트 다이내믹 뷰포트]
      // 1) 평상시 (투시변환 OFF): 스테이지를 시원하게 채워 용지와 이미지를 크게 열람 (여백 최소화 14px)
      // 2) 투시변환 ON: 핀을 용지 밖으로 넓게 당길 수 있도록 기존보다 25% 더 축소하여 회색 작업 영역을 대폭 확장!
      let maxBoxW, maxBoxH;
      if (isPerspectiveActive) {
        const prevBoxW = Math.max(70, stageW - Math.max(22, Math.round(stageW * 0.18)) * 2);
        const prevBoxH = Math.max(80, stageH - Math.max(26, Math.round(stageH * 0.18)) * 2);
        maxBoxW = Math.max(50, Math.round(prevBoxW * 0.75));
        maxBoxH = Math.max(60, Math.round(prevBoxH * 0.75));
      } else {
        maxBoxW = Math.max(100, stageW - 14);
        maxBoxH = Math.max(120, stageH - 14);
      }

      const curIdx = docState.currentIndex;
      const cfg = getEffectiveItemSettings(curIdx);
      const { rot, rotPage, rotImg, isPageRot90, isImgRot90, target } = getResolvedRotations(cfg);
      const fitKey = cfg.pageSize || cfg.fit || 'original';
      const cScale = cfg.contentScale || 1.0;
      const scaleX = cfg.scaleX !== undefined ? cfg.scaleX : 1.0;
      const brightness = cfg.brightness !== undefined ? cfg.brightness : 100;
      const contrast = cfg.contrast !== undefined ? cfg.contrast : 100;
      const offsetX = cfg.offsetX !== undefined ? cfg.offsetX : 0;
      const offsetY = cfg.offsetY !== undefined ? cfg.offsetY : 0;
      const marginPx = cfg.margin || 0;

      const item = docState.items[curIdx];
      const origW = item ? (item.width || (item.imgObj ? item.imgObj.width : 1200)) : 1200;
      const origH = item ? (item.height || (item.imgObj ? item.imgObj.height : 1600)) : 1600;

      const basePaperW = (isPageRot90 ? origH : origW) + marginPx * 2;
      const basePaperH = (isPageRot90 ? origW : origH) + marginPx * 2;
      const isOrigLandscape = origW > origH;
      const orientOpt = cfg.orient || 'auto';
      const baseLandscape = orientOpt === 'l' || (orientOpt === 'auto' && isOrigLandscape);
      const isLandscape = isPageRot90 ? !baseLandscape : baseLandscape;
      const paper = resolvePaperGeometry(fitKey, isLandscape, basePaperW, basePaperH, cfg.customW, cfg.customH);

      // 미리보기 박스(maxBoxW x maxBoxH) 안에 들어갈 시트 크기 계산
      let sheetW, sheetH;
      if (paper.ratio >= (maxBoxW / maxBoxH)) {
        sheetW = maxBoxW;
        sheetH = Math.max(20, Math.round(maxBoxW / paper.ratio));
      } else {
        sheetH = maxBoxH;
        sheetW = Math.max(20, Math.round(maxBoxH * paper.ratio));
      }

      // 종이 용지 CSS 크기 확정 (용지는 확대/축소에도 절대 변하지 않음!)
      miniSheet.style.width = `${sheetW}px`;
      miniSheet.style.height = `${sheetH}px`;
      miniSheet.style.aspectRatio = `${paper.widthPx} / ${paper.heightPx}`;

      const rotParts = [];
      if (rotPage !== 0) rotParts.push(`페이지 ${rotPage}°`);
      if (rotImg !== 0) rotParts.push(`이미지 ${rotImg}°`);
      const rotLabelStr = rotParts.length > 0 ? ` [${rotParts.join(', ')}]` : ` [0°]`;

      // 1줄: 용지 규격 및 독립 회전 현황
      const line1 = `${paper.name}${rotLabelStr}`;

      // 2줄: 사용자가 이미지에 적용한 편집 내용 압축 요약
      const line2Parts = [];
      line2Parts.push(`크기${Math.round(cScale * 100)}%`);
      if (scaleX !== 1.0) line2Parts.push(`가로${Math.round(scaleX * 100)}%`);
      if (cfg.trapExp && (cfg.trapExp.top || cfg.trapExp.bot)) {
        if (cfg.trapExp.top) line2Parts.push(`대두+${cfg.trapExp.top}px`);
        if (cfg.trapExp.bot) line2Parts.push(`소두+${cfg.trapExp.bot}px`);
      } else if (cfg.trapezoid) {
        const trapVal = Math.round(cfg.trapezoid * 100);
        line2Parts.push(trapVal > 0 ? `대두+${trapVal}%` : `소두+${Math.abs(trapVal)}%`);
      }
      const c = cfg.corners;
      if (c && (c.tl?.x || c.tl?.y || c.tr?.x || c.tr?.y || c.br?.x || c.br?.y || c.bl?.x || c.bl?.y)) {
        line2Parts.push(`투시📐`);
      }
      if (brightness !== 100) line2Parts.push(`밝기${brightness}%`);
      if (contrast !== 100) line2Parts.push(`명암${contrast}%`);
      if (offsetX !== 0 || offsetY !== 0) line2Parts.push(`위치(${Number(offsetX.toFixed(1))},${Number(offsetY.toFixed(1))})`);
      const line2 = line2Parts.join(' · ');

      info.innerHTML = `<div class="mini-info-line1" title="${line1}">${line1}</div><div class="mini-info-line2" title="${line2}">${line2}</div>`;
      info.title = `${line1}\n${line2}`;

      // 초고화질 Canvas 렌더링 (모바일 손가락 핀치 줌 열람 시에도 왼쪽 썸네일 이상의 초고화질 유지)
      const dpr = Math.max(3.5, (window.devicePixelRatio || 2) * 1.5);
      miniCanvas.width = Math.round(sheetW * dpr);
      miniCanvas.height = Math.round(sheetH * dpr);
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.scale(dpr, dpr);

      // 하얀색 용지 바탕 또는 투명 처리
      const isTransparent = ((cfg.format || 'png') === 'png') && (cfg.transparentBg !== false);
      if (isTransparent) {
        mctx.clearRect(0, 0, sheetW, sheetH);
        miniSheet.classList.add('checkerboard-bg');
      } else {
        mctx.fillStyle = '#ffffff';
        mctx.fillRect(0, 0, sheetW, sheetH);
        miniSheet.classList.remove('checkerboard-bg');
      }

      // mainViewerCanvas는 이미 drawPaperWithImage로 모든 회전/편집/여백이 완벽히 합성된 용지 캔버스이므로
      // miniCanvas에 1:1 완벽 축약 복사하여 2열과 3열의 100% 비주얼 일체화를 보장합니다!
      mctx.drawImage(srcCanvas, 0, 0, sheetW, sheetH);

      // 모바일 미니 프리뷰 상의 투시 핀 위치 실시간 동기화 (이미지 확대/축소 시 핀 핸들도 함께 자동 확대)
      if (isPerspectiveActive) {
        updateCornerPins();
      }
    }

    // [핵심] 통합 듀얼 저장 라우터 (PDF 저장 vs Img 저장)
