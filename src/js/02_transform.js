    // 용지(종이) 회전 함수
    function rotatePageByDelta(delta) {
      const cur = docState.currentIndex;
      const cfg = getEffectiveItemSettings(cur);
      let curPage = parseInt(cfg.rotPage !== undefined ? cfg.rotPage : 0, 10) || 0;
      let nextPage = curPage + delta;
      if (nextPage > 180) nextPage -= 360;
      if (nextPage <= -180) nextPage += 360;
      cfg.rotPage = nextPage;
      const lblPage = document.getElementById('lblPageRotVal');
      if (lblPage) lblPage.textContent = `${nextPage}°`;
      updateViewerEdits();
      updateMiniPreview();
      updateStatusMsg(`용지 회전: ${nextPage}°`, '📄');
    }

    function rotatePageTo(val) {
      const cur = docState.currentIndex;
      const cfg = getEffectiveItemSettings(cur);
      cfg.rotPage = val;
      const lblPage = document.getElementById('lblPageRotVal');
      if (lblPage) lblPage.textContent = `${val}°`;
      updateViewerEdits();
      updateMiniPreview();
      updateStatusMsg('용지 회전 0° 초기화', '📄');
    }

    // 객체(내용물 이미지) 회전 함수
    function rotateImageByDelta(delta) {
      if (typeof handleLayerRotateByDelta === 'function' && handleLayerRotateByDelta(delta)) return;
      const cur = docState.currentIndex;
      const cfg = getEffectiveItemSettings(cur);
      let curImg = parseInt(cfg.rotImg !== undefined ? cfg.rotImg : 0, 10) || 0;
      let nextImg = curImg + delta;
      if (nextImg > 180) nextImg -= 360;
      if (nextImg <= -180) nextImg += 360;
      cfg.rotImg = nextImg;
      cfg.rot = nextImg;
      const slider = document.getElementById('sliderRotation');
      if (slider) slider.value = nextImg;
      const lblRot = document.getElementById('lblRotationVal');
      if (lblRot) lblRot.textContent = `${nextImg}°`;
      updateViewerEdits();
      updateMiniPreview();
      if (isPerspectiveActive) updateCornerPins();
      updateStatusMsg(`객체 회전: ${nextImg}°`, '🖼️');
    }

    function rotateImageTo(val) {
      if (typeof handleLayerRotateTo === 'function' && handleLayerRotateTo(val)) return;
      const cur = docState.currentIndex;
      const cfg = getEffectiveItemSettings(cur);
      cfg.rotImg = val;
      cfg.rot = val;
      const slider = document.getElementById('sliderRotation');
      if (slider) slider.value = val;
      const lblRot = document.getElementById('lblRotationVal');
      if (lblRot) lblRot.textContent = `${val}°`;
      updateViewerEdits();
      updateMiniPreview();
      if (isPerspectiveActive) updateCornerPins();
      updateStatusMsg('객체 회전 0° 초기화', '🖼️');
    }

    function registerOpenedFile(file, type, loadedDoc = null, customTotalPages = 1) {
      if (!docState.openedFiles) docState.openedFiles = [];
      const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const record = {
        fileId: fileId,
        name: file ? file.name : (type === 'blank' ? '빈 페이지' : '이름 없음'),
        type: type,
        file: file || null,
        doc: loadedDoc || null,
        totalDocPages: loadedDoc ? loadedDoc.numPages : customTotalPages,
        openedAt: Date.now()
      };
      docState.openedFiles.push(record);
      return fileId;
    }

    function formatPageRanges(pages) {
      if (!pages || pages.length === 0) return '없음';
      const sorted = [...new Set(pages)].sort((a, b) => a - b);
      const ranges = [];
      let start = sorted[0];
      let end = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === end + 1) {
          end = sorted[i];
        } else {
          ranges.push(start === end ? `${start}` : `${start}~${end}`);
          start = sorted[i];
          end = sorted[i];
        }
      }
      ranges.push(start === end ? `${start}` : `${start}~${end}`);
      return ranges.join(', ');
    }

    const pdfState = {
      get doc() { return docState.items[docState.currentIndex]?.doc || null; },
      set doc(d) {},
      get fileName() { return docState.fileName; },
      set fileName(v) { docState.fileName = v; },
      get pages() { return docState.items; },
      set pages(v) { docState.items = v; },
      get checkList() { return docState.checkList; },
      set checkList(v) { docState.checkList = v; },
      get currentIndex() { return docState.currentIndex; },
      set currentIndex(v) { docState.currentIndex = v; },
      get zoom() { return docState.zoom; },
      set zoom(v) { docState.zoom = v; },
      get globalSettings() { return docState.globalSettings; }
    };

    const pickerState = {
      doc: null,
      file: null,
      total: 0,
      selected: [],
      targetInsertIndex: -1,
      mode: 'insert',
      resyncFileId: null
    };
    let pendingInsertIndex = -1;

    const imgState = {
      get items() { return docState.items; },
      set items(v) { docState.items = v; },
      get checkList() { return docState.checkList; },
      set checkList(v) { docState.checkList = v; },
      get currentIndex() { return docState.currentIndex; },
      set currentIndex(v) { docState.currentIndex = v; },
      get zoom() { return docState.zoom; },
      set zoom(v) { docState.zoom = v; },
      get fileName() { return docState.fileName; },
      set fileName(v) { docState.fileName = v; },
      get globalSettings() { return docState.globalSettings; }
    };

    let appMode = 'unified'; // 단일 통합 모드
    let isAborted = false;
    let zipBlobs = [];
    let draggedCardIndex = null;

    // 삽입 이미지 페이지를 PDF 페이지(A4 x3 기준 1785x2526)와 동일한 스케일로 맞추는 배율
    function getImagePageFactor(w, h) {
      const longSide = Math.max(w, h), shortSide = Math.min(w, h);
      return Math.min(2526 / longSide, 1785 / shortSide);
    }

    // [ADR-027] 출력 물리 축척 산출: 자르기와 무관하게 '원래 용지' 기준으로 mm/px 및 이미지 맞춤 배율을 고정
    // - fullPaperW/H: 미자르기 원래 용지의 출력 픽셀 크기
    // - mmPerPx: 출력 픽셀 1개당 실제 mm (A4 등은 규격 mm, PDF 원본은 원래 pt 크기, 그 외 긴 변 297mm)
    // - imgFit: 원래 용지 위에 이미지가 맞춰질 때의 배율 (종이 연동 결과물을 같은 실제 크기로 출력하기 위함)
    function getOutputPaperScale(p, cfg, scaleMul) {
      const { isPageRot90 } = getResolvedRotations(cfg);
      const fW = p.width || (p.imgObj ? (p.imgObj.naturalWidth || p.imgObj.width) : 1200);
      const fH = p.height || (p.imgObj ? (p.imgObj.naturalHeight || p.imgObj.height) : 1600);
      const bW = (isPageRot90 ? fH : fW) * scaleMul;
      const bH = (isPageRot90 ? fW : fH) * scaleMul;
      const orientOpt = cfg.orient || 'auto';
      const baseLandscape = orientOpt === 'l' || (orientOpt === 'auto' && fW > fH);
      const isLandscape = isPageRot90 ? !baseLandscape : baseLandscape;
      const key = cfg.fit || cfg.pageSize || 'original';
      const paper = resolvePaperGeometry(key, isLandscape, bW, bH, cfg.customW, cfg.customH);
      let pw, ph;
      if (key === 'original') {
        pw = Math.round(bW); ph = Math.round(bH);
      } else if (key === 'custom') {
        pw = Math.round(paper.widthPx); ph = Math.round(paper.heightPx);
      } else if (paper.isLandscape) {
        pw = Math.max(bW, Math.round(bH * paper.ratio)); ph = Math.round(pw / paper.ratio);
      } else {
        ph = Math.max(bH, Math.round(bW / paper.ratio)); pw = Math.round(ph * paper.ratio);
      }
      let longMm = 297;
      if (typeof PAPER_SPECS !== 'undefined' && PAPER_SPECS[key]) {
        longMm = Math.max(PAPER_SPECS[key].wMm, PAPER_SPECS[key].hMm);
      }
      const mmPerPx = longMm / Math.max(1, pw, ph);
      const margin = cfg.margin || 0;
      const imgFit = Math.min(Math.max(10, pw - margin * 2) / bW, Math.max(10, ph - margin * 2) / bH);
      return { fullPaperW: pw, fullPaperH: ph, mmPerPx, imgFit };
    }

    // 회전 타겟(페이지, 이미지) 해석 헬퍼 함수
    function getResolvedRotations(cfg) {
      const rotPage = parseInt(cfg.rotPage !== undefined ? cfg.rotPage : (cfg.rot || 0), 10) || 0;
      const rotImg = parseInt(cfg.rotImg !== undefined ? cfg.rotImg : (cfg.rot || 0), 10) || 0;
      const target = cfg.rotTarget || { page: true, image: true };
      const pageStep90 = Math.round(rotPage / 90);
      const imgStep90 = Math.round(rotImg / 90);
      const isPageRot90 = (Math.abs(pageStep90) % 2 === 1);
      const isImgRot90 = (Math.abs(imgStep90) % 2 === 1);
      // rot는 슬라이더 및 UI 라벨 표시용 대표 각도 (선택된 타겟 기준)
      const rot = target.image ? rotImg : (target.page ? rotPage : 0);
      return { rot, rotPage, rotImg, isPageRot90, isImgRot90, target };
    }

    // 사다리꼴 변형 상단/하단 확장량 해석 헬퍼 함수 (상단과 하단이 독립적으로 유지·확장)
    function resolveTrapezoidExpands(trapezoid, dw, scalePxX = 1) {
      let topExp = 0, botExp = 0;
      if (typeof trapezoid === 'object' && trapezoid !== null) {
        topExp = (trapezoid.top || 0) * scalePxX;
        botExp = (trapezoid.bot || 0) * scalePxX;
      } else if (typeof trapezoid === 'number' && trapezoid !== 0) {
        if (trapezoid > 0) {
          topExp = dw * trapezoid;
        } else {
          botExp = dw * Math.abs(trapezoid);
        }
      }
      return { topExp, botExp };
    }

    // [핵심] 사다리꼴 변형 (상단 폭 / 하단 폭 독립적 확장 지원)
    function drawImageWithTrapezoid(ctx, imgSource, dx, dy, dw, dh, trapezoid) {
      const srcW = imgSource.naturalWidth || imgSource.width || dw;
      const srcH = imgSource.naturalHeight || imgSource.height || dh;
      const scalePxX = dw / srcW;
      const { topExp, botExp } = resolveTrapezoidExpands(trapezoid, dw, scalePxX);

      if (topExp === 0 && botExp === 0) {
        ctx.drawImage(imgSource, dx, dy, dw, dh);
        return;
      }
      const slices = 60;
      const sliceSrcH = srcH / slices;
      const sliceDstH = dh / slices;

      const topW = dw + topExp;
      const botW = dw + botExp;

      for (let i = 0; i < slices; i++) {
        const t = i / (slices - 1); // 0 (상단) ~ 1 (하단)
        const curW = topW * (1 - t) + botW * t;
        const curX = dx + (dw - curW) / 2;
        const curY = dy + i * sliceDstH;

        ctx.drawImage(
          imgSource,
          0, i * sliceSrcH, srcW, sliceSrcH,
          curX, curY, curW, sliceDstH + 0.5
        );
      }
    }

    // [핵심] 사각 투시 변환(Perspective Warp / 4-Corner Pinning) 12x12 메쉬 아핀 매핑 렌더링
    function drawPerspectiveQuad(ctx, imgSource, dx, dy, dw, dh, corners, trapezoid) {
      const srcW = imgSource.naturalWidth || imgSource.width || dw;
      const srcH = imgSource.naturalHeight || imgSource.height || dh;
      const scalePxX = dw / srcW;
      const scalePxY = dh / srcH;
      const { topExp, botExp } = resolveTrapezoidExpands(trapezoid, dw, scalePxX);

      const c = corners || { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } };
      const isZeroCorners = (!c.tl || (c.tl.x === 0 && c.tl.y === 0 && c.tr.x === 0 && c.tr.y === 0 && c.br.x === 0 && c.br.y === 0 && c.bl.x === 0 && c.bl.y === 0));

      if (isZeroCorners && topExp === 0 && botExp === 0) {
        ctx.drawImage(imgSource, dx, dy, dw, dh);
        return;
      }
      if (isZeroCorners && (topExp !== 0 || botExp !== 0)) {
        drawImageWithTrapezoid(ctx, imgSource, dx, dy, dw, dh, trapezoid);
        return;
      }

      // 사다리꼴 오프셋 계산 (상단 및 하단 각각 독립적 좌우 확장)
      const trapTopOffset = topExp / 2;
      const trapBotOffset = botExp / 2;

      // 4개 코너 목적지 좌표 (dx, dy 기준 + 원본 픽셀 단위 1:1 오프셋 매핑)
      const pTL = {
        x: dx - trapTopOffset + ((c.tl?.x || 0) * scalePxX),
        y: dy + ((c.tl?.y || 0) * scalePxY)
      };
      const pTR = {
        x: dx + dw + trapTopOffset + ((c.tr?.x || 0) * scalePxX),
        y: dy + ((c.tr?.y || 0) * scalePxY)
      };
      const pBR = {
        x: dx + dw + trapBotOffset + ((c.br?.x || 0) * scalePxX),
        y: dy + dh + ((c.br?.y || 0) * scalePxY)
      };
      const pBL = {
        x: dx - trapBotOffset + ((c.bl?.x || 0) * scalePxX),
        y: dy + dh + ((c.bl?.y || 0) * scalePxY)
      };

      const gridX = 12;
      const gridY = 12;

      function getDestPoint(u, v) {
        const invU = 1 - u;
        const invV = 1 - v;
        return {
          x: invU * invV * pTL.x + u * invV * pTR.x + u * v * pBR.x + invU * v * pBL.x,
          y: invU * invV * pTL.y + u * invV * pTR.y + u * v * pBR.y + invU * v * pBL.y
        };
      }

      function renderTriangle(s0, s1, s2, d0, d1, d2) {
        const denom = (s0.x - s2.x) * (s1.y - s2.y) - (s1.x - s2.x) * (s0.y - s2.y);
        if (Math.abs(denom) < 1e-8) return;

        const a = ((d0.x - d2.x) * (s1.y - s2.y) - (d1.x - d2.x) * (s0.y - s2.y)) / denom;
        const b = ((d0.y - d2.y) * (s1.y - s2.y) - (d1.y - d2.y) * (s0.y - s2.y)) / denom;
        const cMat = ((s0.x - s2.x) * (d1.x - d2.x) - (s1.x - s2.x) * (d0.x - d2.x)) / denom;
        const dMat = ((s0.x - s2.x) * (d1.y - d2.y) - (s1.x - s2.x) * (d0.y - d2.y)) / denom;
        const e = d0.x - a * s0.x - cMat * s0.y;
        const f = d0.y - b * s0.x - dMat * s0.y;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(d0.x, d0.y);
        ctx.lineTo(d1.x, d1.y);
        ctx.lineTo(d2.x, d2.y);
        ctx.closePath();
        ctx.clip();
        ctx.transform(a, b, cMat, dMat, e, f);
        ctx.drawImage(imgSource, 0, 0, srcW, srcH);
        ctx.restore();
      }

      for (let gy = 0; gy < gridY; gy++) {
        const v0 = gy / gridY;
        const v1 = (gy + 1) / gridY;
        const sy0 = v0 * srcH;
        const sy1 = v1 * srcH;

        for (let gx = 0; gx < gridX; gx++) {
          const u0 = gx / gridX;
          const u1 = (gx + 1) / gridX;
          const sx0 = u0 * srcW;
          const sx1 = u1 * srcW;

          const dTL = getDestPoint(u0, v0);
          const dTR = getDestPoint(u1, v0);
          const dBR = getDestPoint(u1, v1);
          const dBL = getDestPoint(u0, v1);

          renderTriangle(
            { x: sx0, y: sy0 },
            { x: sx1, y: sy0 },
            { x: sx0, y: sy1 },
            dTL, dTR, dBL
          );

          renderTriangle(
            { x: sx1, y: sy0 },
            { x: sx1, y: sy1 },
            { x: sx0, y: sy1 },
            dTR, dBR, dBL
          );
        }
      }
    }

    // 종이 위에 올려진 이미지가 종이 밖으로 나갈 때, 이미지의 마지막 1픽셀이 종이 경계와 닿아있을 때까지의 최대 허용 오프셋(%) 계산
    function getImageOffsetMaxLimits(item, cfg) {
      if (!item || !cfg) return { maxOffsetX: 100, maxOffsetY: 100 };

      const sizeKey = cfg.pageSize || cfg.fit || 'original';
      const marginPx = cfg.margin || 0;
      const { rotImg, isPageRot90, isImgRot90 } = getResolvedRotations(cfg);

      const origW = item.width || (item.imgObj ? item.imgObj.width : 1200);
      const origH = item.height || (item.imgObj ? item.imgObj.height : 1600);

      const isOrigLandscape = origW > origH;
      const orientOpt = cfg.orient || 'auto';
      const baseLandscape = orientOpt === 'l' || (orientOpt === 'auto' && isOrigLandscape);
      const isLandscape = isPageRot90 ? !baseLandscape : baseLandscape;

      const basePaperW = (isPageRot90 ? origH : origW) + marginPx * 2;
      const basePaperH = (isPageRot90 ? origW : origH) + marginPx * 2;
      const paper = resolvePaperGeometry(sizeKey, isLandscape, basePaperW, basePaperH, cfg.customW, cfg.customH);

      const canvasW = 1000;
      const canvasH = Math.max(50, Math.round(canvasW / (paper.ratio || 1)));

      const scaleFactor = canvasW / (paper.widthPx || 1000);
      const viewMargin = Math.round(marginPx * scaleFactor);
      const innerW = Math.max(10, canvasW - (viewMargin * 2));
      const innerH = Math.max(10, canvasH - (viewMargin * 2));

      const rotImgW = isImgRot90 ? origH : origW;
      const rotImgH = isImgRot90 ? origW : origH;
      const fitScale = Math.min(innerW / rotImgW, innerH / rotImgH);
      const baseDrawW = rotImgW * fitScale;
      const baseDrawH = rotImgH * fitScale;

      const cScale = cfg.contentScale || 1.0;
      const scaleX = cfg.scaleX !== undefined ? cfg.scaleX : 1.0;
      const finalW = baseDrawW * cScale * scaleX;
      const finalH = baseDrawH * cScale;

      // 미세 회전 각도를 고려한 외접 사각형 (AABB) 크기
      const fineRad = Math.abs((rotImg - Math.round(rotImg / 90) * 90) * Math.PI / 180);
      const boxW = Math.abs(finalW * Math.cos(fineRad)) + Math.abs(finalH * Math.sin(fineRad));
      const boxH = Math.abs(finalW * Math.sin(fineRad)) + Math.abs(finalH * Math.cos(fineRad));

      // 이미지의 마지막 1픽셀이 종이 외곽선과 인접할 때까지 허용
      // maxShiftX = (canvasW + boxW)/2 - 1px
      // maxOffsetX = (maxShiftX / canvasW) * 100
      const maxOffsetX = Math.max(10, Math.round((((canvasW + boxW) / 2 - 1) / canvasW * 100) * 10) / 10);
      const maxOffsetY = Math.max(10, Math.round((((canvasH + boxH) / 2 - 1) / canvasH * 100) * 10) / 10);

      return { maxOffsetX, maxOffsetY };
    }
