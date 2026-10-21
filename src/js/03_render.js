    async function ensureItemCanvas(item) {
      if (!item) return null;
      if (item.type === 'image') return item.imgObj;
      if (item.type === 'pdf') {
        if (!item.imgObj) {
          const page = await item.doc.getPage(item.pageNum);
          const origVp = page.getViewport({ scale: 1.0 });
          item.width = origVp.width;
          item.height = origVp.height;
          // 초고화질 2.5x 오프스크린 캔버스 렌더링 (모바일 및 고해상도 확대 시에도 칼같은 텍스트 가독성 확보)
          const offCanvas = document.createElement('canvas');
          const vp = page.getViewport({ scale: 2.5 });
          offCanvas.width = vp.width;
          offCanvas.height = vp.height;
          const offCtx = offCanvas.getContext('2d');
          offCtx.fillStyle = '#ffffff';
          offCtx.fillRect(0, 0, vp.width, vp.height);
          await page.render({ canvasContext: offCtx, viewport: vp }).promise;
          item.imgObj = offCanvas;
        }
        return item.imgObj;
      }
      return null;
    }

    // [핵심] 바탕 용지(Paper) 규격/방향/여백 위에 내용물(Image)의 위치/회전/스케일/필터/투시변환을 합성하여 캔버스에 렌더링
    function drawPaperWithImage(canvas, item, cfg, options = {}) {
      if (!canvas || !item || !item.imgObj) return null;
      const ctx = canvas.getContext('2d');

      const { rotImg, isPageRot90, isImgRot90 } = getResolvedRotations(cfg);
      const rotRad = (rotImg * Math.PI) / 180;

      // 1. 이미지 자체 회전 적용 후 치수 (비파괴 크롭 반영)
      // [핵심] 중앙 메인 뷰어에서 자르기 모드(isCropActive)가 켜져 있을 때는 원본 전체 이미지를 표시하여
      // 이전에 잘랐던 핸들 위치를 원본 상에서 자유롭게 재조정(확장/축소)할 수 있도록 보장
      const isViewerCropActive = (typeof isCropActive !== 'undefined' && isCropActive && canvas.id === 'mainViewerCanvas');
      const isPaperCrop = Boolean(!isViewerCropActive && cfg.crop && cfg.crop.cropPaper);
      const isObjectCrop = Boolean(!isViewerCropActive && cfg.crop && !cfg.crop.cropPaper);

      const fullW = item.width || (item.imgObj ? (item.imgObj.naturalWidth || item.imgObj.width) : 1200);
      const fullH = item.height || (item.imgObj ? (item.imgObj.naturalHeight || item.imgObj.height) : 1600);

      // [ADR-027] 화면 표시(1·2·3열)에서 종이 연동 자르기 페이지는 확대하지 않고,
      // 원래 용지(원본/A4 등) 축척 그대로 작아진 용지를 중앙에 표시하여 실제 크기를 다른 페이지와 비교 가능하게 함.
      if (isPaperCrop && !(options.targetWidth && options.targetHeight)) {
        const fullCfg = Object.assign({}, cfg, { crop: null });
        const fullPaper = drawPaperWithImage(canvas, item, fullCfg, Object.assign({}, options, { skipLayers: true }));
        if (!fullPaper) return null;
        const cW = canvas.width, cH = canvas.height;
        const mPx = cfg.margin || 0;
        const vM = mPx * cW / (fullPaper.widthPx || cW);
        const rFW = isImgRot90 ? fullH : fullW;
        const rFH = isImgRot90 ? fullW : fullH;
        const k = Math.min(Math.max(10, cW - vM * 2) / rFW, Math.max(10, cH - vM * 2) / rFH);
        const eff = (typeof getEffectiveImageDimensions === 'function') ? getEffectiveImageDimensions(item) : { width: fullW, height: fullH };
        const subW = Math.max(10, Math.min(cW, Math.round(((isPageRot90 ? eff.height : eff.width) * k) + vM * 2)));
        const subH = Math.max(10, Math.min(cH, Math.round(((isPageRot90 ? eff.width : eff.height) * k) + vM * 2)));
        let sub = document.createElement('canvas');
        drawPaperWithImage(sub, item, cfg, { targetWidth: subW, targetHeight: subH });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.filter = 'none';
        // 원래 용지 영역 중 잘려 나간 부분은 연회색으로 표시하고, 잘린 용지는 얇은 테두리로 구분
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(0, 0, cW, cH);
        const sx = Math.round((cW - subW) / 2), sy = Math.round((cH - subH) / 2);
        if (!(((cfg.format || 'png') === 'png') && (cfg.transparentBg !== false))) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(sx, sy, subW, subH);
        } else {
          ctx.clearRect(sx, sy, subW, subH);
        }
        ctx.drawImage(sub, sx, sy);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = Math.max(1, Math.round(cW / 800));
        ctx.strokeRect(sx + 0.5, sy + 0.5, subW - 1, subH - 1);
        sub.width = 0; sub.height = 0; sub = null;
        return fullPaper;
      }

      // 1. 용지 바탕 치수 계산
      // - 종이 연동 (cropPaper: true): 바탕 종이 규격 자체가 잘라낸 이미지에 맞춰 1:1로 함께 축소됨.
      // - 객체 자르기 (cropPaper: false): 종이 규격(A4, 원본 등)은 절대 변하지 않고 온전히 유지되며, 종이 위에서 객체만 잘려 주변 여백이 보존됨.
      let origW, origH;
      if (isPaperCrop) {
        const effDims = (typeof getEffectiveImageDimensions === 'function') ? getEffectiveImageDimensions(item) : { width: fullW, height: fullH };
        origW = effDims.width;
        origH = effDims.height;
      } else {
        origW = fullW;
        origH = fullH;
      }
      const rotImgW = isImgRot90 ? origH : origW;
      const rotImgH = isImgRot90 ? origW : origH;

      // 2. 용지(Paper) 규격 계산
      const isOrigLandscape = (origW > origH);
      const orientOpt = cfg.orient || 'auto';
      const baseLandscape = orientOpt === 'l' || (orientOpt === 'auto' && isOrigLandscape);
      const isLandscape = isPageRot90 ? !baseLandscape : baseLandscape;
      const marginPx = cfg.margin || 0;
      let sizeKey = cfg.pageSize || cfg.fit || 'original';
      if (isPaperCrop) sizeKey = 'custom';

      // [핵심 무결성] 용지 규격은 페이지 회전(rotPage / isPageRot90)과 방향(orient)에 의해서만 결정되며
      // 내용물인 이미지 자체의 회전(rotImg)에 의해 바탕 용지가 회전되는 일이 원천 차단됩니다.
      const basePaperW = (isPageRot90 ? origH : origW) + marginPx * 2;
      const basePaperH = (isPageRot90 ? origW : origH) + marginPx * 2;
      const customW = isPaperCrop ? basePaperW : cfg.customW;
      const customH = isPaperCrop ? basePaperH : cfg.customH;
      const paper = resolvePaperGeometry(sizeKey, isLandscape, basePaperW, basePaperH, customW, customH);

      // 3. 대상 캔버스 해상도 결정 (초고해상도 복원 및 내보내기/인쇄 전용 크기 완벽 지원)
      let canvasW, canvasH;
      if (options.targetWidth && options.targetHeight) {
        canvasW = Math.round(options.targetWidth);
        canvasH = Math.round(options.targetHeight);
      } else if (options.isThumbnail) {
        // [모바일 및 고해상도 지원] 왼쪽 썸네일 카드가 모바일 및 고해상도 디스플레이에서 글자까지 또렷이 식별되도록 초고화질(800px) 해상도 보장
        const baseW = 800;
        canvasW = baseW;
        canvasH = Math.max(40, Math.round(baseW / paper.ratio));
      } else {
        // [중앙 뷰어 & 우측 미니 프리뷰 원본 연동] 2000px 초고해상도 캔버스로 확대 시에도 텍스트 및 세부 디테일 완벽 보존
        const baseDim = 2000;
        if (paper.ratio >= 1) {
          canvasW = baseDim;
          canvasH = Math.max(50, Math.round(baseDim / paper.ratio));
        } else {
          canvasH = baseDim;
          canvasW = Math.max(50, Math.round(baseDim * paper.ratio));
        }
      }

      canvas.width = canvasW;
      canvas.height = canvasH;

      // 4. 종이 바탕 그리기
      const isTransparent = ((cfg.format || 'png') === 'png') && (cfg.transparentBg !== false);
      if (isTransparent) {
        ctx.clearRect(0, 0, canvasW, canvasH);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasW, canvasH);
      }

      // 5. 여백 및 내부 영역 계산
      const scaleFactor = canvasW / paper.widthPx;
      const viewMargin = Math.round(marginPx * scaleFactor);
      const innerW = Math.max(10, canvasW - (viewMargin * 2));
      const innerH = Math.max(10, canvasH - (viewMargin * 2));

      // 6. 이미지 맞춤 및 편집 배율/오프셋 계산
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

      // 7. 클리핑 및 이미지 그리기
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, canvasW, canvasH);
      ctx.clip();

      const brightness = cfg.brightness !== undefined ? cfg.brightness : 100;
      const contrast = cfg.contrast !== undefined ? cfg.contrast : 100;
      if (brightness !== 100 || contrast !== 100) {
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      }

      ctx.translate(posX + finalW / 2, posY + finalH / 2);
      ctx.rotate(rotRad);

      const origDrawW = isImgRot90 ? (baseDrawH * cScale) : (baseDrawW * cScale * scaleX);
      const origDrawH = isImgRot90 ? (baseDrawW * cScale * scaleX) : (baseDrawH * cScale);
      
      if (isObjectCrop && cfg.crop) {
        // [객체 자르기]: 종이 규격 및 위치는 고정 유지하고, 종이 위에서 사용자가 지정한 객체 영역만 원래 위치·크기에 렌더링 (투시변환 연동)
        const crop = cfg.crop;
        const cx = -origDrawW / 2 + origDrawW * (crop.x || 0);
        const cy = -origDrawH / 2 + origDrawH * (crop.y || 0);
        const cw = origDrawW * (crop.w !== undefined ? crop.w : 1);
        const ch = origDrawH * (crop.h !== undefined ? crop.h : 1);
        const effImgSource = (typeof getEffectiveImageSource === 'function') ? getEffectiveImageSource(item) : item.imgObj;
        drawPerspectiveQuad(ctx, effImgSource, cx, cy, cw, ch, cfg.corners, cfg.trapExp || cfg.trapezoid);
      } else if (isPaperCrop) {
        // [종이 연동]: 종이 바탕 자체가 잘린 크기에 맞춰 축소된 상태이므로, 슬라이스된 캔버스를 타이트하게 렌더링
        const effImgSource = (typeof getEffectiveImageSource === 'function') ? getEffectiveImageSource(item) : item.imgObj;
        drawPerspectiveQuad(ctx, effImgSource, -origDrawW / 2, -origDrawH / 2, origDrawW, origDrawH, cfg.corners, cfg.trapExp || cfg.trapezoid);
      } else {
        // 미자르기 또는 뷰어 자르기 편집 모드: 원본 전체 이미지를 온전히 렌더링
        drawPerspectiveQuad(ctx, item.imgObj, -origDrawW / 2, -origDrawH / 2, origDrawW, origDrawH, cfg.corners, cfg.trapExp || cfg.trapezoid);
      }
      ctx.restore();

      // 8. 다중 객체 레이어(글상자, 도형, 이미지/PDF 조각) 합성 렌더링 (WYSIWYG 3창 및 모든 내보내기 공통)
      if (!options.skipLayers && typeof renderItemLayers === 'function') {
        renderItemLayers(ctx, canvasW, canvasH, item, cfg, options);
      }

      return paper;
    }

    // PDF 페이지를 주어진 배율과 임의 각도(미세 회전 포함)로 캔버스에 정밀 렌더링
    async function renderPdfPageToCanvas(page, scale, rotImg, targetCanvas) {
      const base90 = ((Math.round(rotImg / 90) * 90) % 360 + 360) % 360;
      const fineAngle = rotImg - Math.round(rotImg / 90) * 90;
      const vp = page.getViewport({ scale: scale, rotation: base90 });

      targetCanvas.width = vp.width;
      targetCanvas.height = vp.height;
      const ctx = targetCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, vp.width, vp.height);

      if (fineAngle === 0) {
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
      } else {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = vp.width;
        offCanvas.height = vp.height;
        const offCtx = offCanvas.getContext('2d');
        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(0, 0, vp.width, vp.height);
        await page.render({ canvasContext: offCtx, viewport: vp }).promise;

        ctx.save();
        ctx.translate(vp.width / 2, vp.height / 2);
        ctx.rotate((fineAngle * Math.PI) / 180);
        ctx.drawImage(offCanvas, -vp.width / 2, -vp.height / 2);
        ctx.restore();
        offCanvas.width = 0; offCanvas.height = 0;
      }
      return vp;
    }

    // [통합] 현재 페이지 설정값 조회 (항상 해당 페이지의 고유 설정값 반환)
    function getEffectiveItemSettings(pageIndex) {
      const item = docState.items[pageIndex];
      if (!item) {
        return {
          ...docState.globalSettings,
          rotTarget: { ...docState.globalSettings.rotTarget }
        };
      }
      if (!item.settings) {
        item.settings = {
          ...docState.globalSettings,
          rotTarget: { ...docState.globalSettings.rotTarget }
        };
      }
      if (item.settings.pageSize === undefined) item.settings.pageSize = item.settings.fit || docState.globalSettings.pageSize || 'original';
      if (item.settings.fit === undefined) item.settings.fit = item.settings.pageSize;
      if (item.settings.orient === undefined) item.settings.orient = docState.globalSettings.orient || 'auto';
      if (item.settings.scaleX === undefined) item.settings.scaleX = 1.0;
      if (item.settings.trapezoid === undefined) item.settings.trapezoid = 0;
      if (item.settings.brightness === undefined) item.settings.brightness = 100;
      if (item.settings.contrast === undefined) item.settings.contrast = 100;
      if (item.settings.offsetX === undefined) item.settings.offsetX = 0;
      if (item.settings.offsetY === undefined) item.settings.offsetY = 0;
      if (item.settings.transparentBg === undefined) item.settings.transparentBg = (docState.globalSettings.transparentBg !== undefined ? docState.globalSettings.transparentBg : true);
      if (item.settings.isPerspectiveActive === undefined) item.settings.isPerspectiveActive = false;
      if (!item.settings.trapExp) {
        item.settings.trapExp = { top: 0, bot: 0 };
      }
      if (!item.settings.corners) {
        item.settings.corners = {
          tl: { x: 0, y: 0 },
          tr: { x: 0, y: 0 },
          br: { x: 0, y: 0 },
          bl: { x: 0, y: 0 }
        };
      }
      return item.settings;
    }
    const getEffectivePdfSettings = getEffectiveItemSettings;
    const getEffectiveImgSettings = getEffectiveItemSettings;

    // 오른쪽 컨트롤 패널을 현재 선택된 페이지의 설정값으로 100% 실시간 동기화
    function syncControlsForCurrentPage() {
      const cur = docState.currentIndex;
      const cfg = getEffectiveItemSettings(cur);
      const curItem = docState.items[cur];

      // 1. 용지 규격 (fit or pageSize)
      const pageSizeVal = cfg.pageSize || cfg.fit || 'original';
      const selPageSize = document.getElementById('selPageSize');
      if (selPageSize) selPageSize.value = pageSizeVal;

      // 사용자 정의 크기 표시 여부
      const groupCustom = document.getElementById('groupCustomPx');
      if (groupCustom) groupCustom.style.display = pageSizeVal === 'custom' ? 'flex' : 'none';
      const txtCustomW = document.getElementById('txtCustomWidth');
      const txtCustomH = document.getElementById('txtCustomHeight');
      if (txtCustomW) txtCustomW.value = cfg.customW || 1920;
      if (txtCustomH) txtCustomH.value = cfg.customH || 1080;

      // 2. 용지 방향
      const selOrient = document.getElementById('selOrientation');
      if (selOrient) selOrient.value = cfg.orient || 'auto';

      // 3. 여백 설정: PDF 원본 페이지인 경우 여백이 고정되므로 비활성화 안내
      const selMargin = document.getElementById('selMargin');
      const lblMargin = document.getElementById('lblMargin');
      if (selMargin) {
        if (curItem && curItem.type === 'pdf') {
          selMargin.disabled = true;
          selMargin.value = '0';
          if (lblMargin) lblMargin.title = 'PDF 원본 페이지는 문서 고유 여백이 유지됩니다.';
        } else {
          selMargin.disabled = false;
          selMargin.value = String(cfg.margin !== undefined ? cfg.margin : 0);
          if (lblMargin) lblMargin.title = '';
        }
      }

      // 4. 해상도 / 화질
      const scaleVal = parseFloat(cfg.scale) || (cfg.quality === 'standard' ? 1.5 : cfg.quality === 'high' ? 2.0 : 3.0);
      const selScale = document.getElementById('selScale');
      if (selScale) {
        let matched = false;
        for (let i = 0; i < selScale.options.length; i++) {
          if (Math.abs(parseFloat(selScale.options[i].value) - scaleVal) < 0.05) {
            selScale.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (!matched) selScale.value = "3.0";
      }

      // 5. 출력 포맷
      const selFormat = document.getElementById('selFormat');
      if (selFormat) selFormat.value = cfg.format || 'png';
      syncTransparentBgVisibility();

      // 6. 회전 타겟 및 슬라이더 동기화
      const target = cfg.rotTarget || { page: true, image: true };
      const chkPage = document.getElementById('chkRotPage');
      const chkImg = document.getElementById('chkRotImg');
      if (chkPage) chkPage.checked = Boolean(target.page);
      if (chkImg) chkImg.checked = Boolean(target.image);

      const sliderRot = document.getElementById('sliderRotation');
      if (sliderRot) sliderRot.value = cfg.rot || 0;
      const lblRot = document.getElementById('lblRotationVal');
      if (lblRot) lblRot.textContent = `${cfg.rot || 0}°`;
      const lblPage = document.getElementById('lblPageRotVal');
      if (lblPage) lblPage.textContent = `${cfg.rotPage || 0}°`;

      // 7. 투시 변환 활성화 여부 동기화 (페이지별 독립 유지)
      syncPerspectiveUI(Boolean(cfg.isPerspectiveActive));

      // 8. 다중 객체 레이어 UI 및 인스펙터 동기화
      if (typeof syncLayerUI === 'function') {
        syncLayerUI();
      }
    }

    // PNG 포맷 선택 시에만 [배경 투명화] 체크박스 동적 노출/숨김 (가운데 툴바 및 우측/모바일 패널 동시 지원)
    function syncTransparentBgVisibility() {
      const cur = docState.currentIndex;
      const cfg = getEffectiveItemSettings(cur);
      const isPng = (cfg.format || 'png') === 'png';
      const isTrans = cfg.transparentBg !== false;

      // 1. 가운데 메인 뷰어 툴바 체크박스 (데스크톱)
      const wrap = document.getElementById('chkTransparentBgWrap');
      const chk = document.getElementById('chkTransparentBg');
      if (wrap) wrap.style.display = isPng ? 'inline-flex' : 'none';
      if (chk) chk.checked = isTrans;

      // 2. 우측/모바일 컨트롤 패널 체크박스
      const grpControl = document.getElementById('grpTransparentBgControl');
      const chkControl = document.getElementById('chkTransparentBgControl');
      if (grpControl) grpControl.style.display = isPng ? 'flex' : 'none';
      if (chkControl) chkControl.checked = isTrans;
    }

    // [배경 투명화] 체크박스 변경 핸들러 (데스크톱 툴바와 모바일 패널 양방향 동기화)
    async function onTransparentBgChange(checked) {
      const cur = docState.currentIndex;
      const cfg = getEffectiveItemSettings(cur);
      cfg.transparentBg = Boolean(checked);

      const chk = document.getElementById('chkTransparentBg');
      const chkControl = document.getElementById('chkTransparentBgControl');
      if (chk) chk.checked = cfg.transparentBg;
      if (chkControl) chkControl.checked = cfg.transparentBg;

      await renderMainViewerCanvas(cur);
      updateThumbnailCanvas(cur);
      updateMiniPreview();
    }

    // 회전 대상(페이지 vs 이미지) 체크박스 변경 핸들러
    // [핵심 원칙] 체크박스는 회전 제어 타겟(Target Selector)일 뿐이며,
    // 체크를 해제하더라도 이미 적용된 회전 각도는 절대 초기화되지 않고 온전히 보존됩니다.
    async function onRotTargetChange() {
      const chkPage = document.getElementById('chkRotPage');
      const chkImg = document.getElementById('chkRotImg');
      const pageChecked = Boolean(chkPage && chkPage.checked);
      const imgChecked = Boolean(chkImg && chkImg.checked);

      const cur = docState.currentIndex;
      const cfg = getEffectiveItemSettings(cur);
      cfg.rotTarget = { page: pageChecked, image: imgChecked };

      // 슬라이더 및 라벨 표시만 현재 선택된 타겟의 값으로 동기화
      const { rot } = getResolvedRotations(cfg);
      const slider = document.getElementById('sliderRotation');
      if (slider) slider.value = rot;
      const lblRot = document.getElementById('lblRotationVal');
      if (lblRot) lblRot.textContent = `${rot}°`;

      // 미니 프리뷰 상태 텍스트 업데이트
      updateMiniPreview();
    }

    // 오른쪽 설정 변경 리스너: 현재 보고 있는 페이지에 즉시 저장 및 좌/중/우 3개 창 동시 실시간 반영!
    async function onSettingChange(key, value) {
      const cur = docState.currentIndex;
      const cfg = getEffectiveItemSettings(cur);

      if (key === 'pageSize' || key === 'fit') {
        cfg.pageSize = value;
        cfg.fit = value;
        const groupCustom = document.getElementById('groupCustomPx');
        if (groupCustom) groupCustom.style.display = value === 'custom' ? 'flex' : 'none';
      } else if (key === 'scale' || key === 'quality') {
        const numScale = parseFloat(value) || 3.0;
        cfg.scale = numScale;
        cfg.quality = numScale >= 3.0 ? 'ultra' : numScale >= 2.0 ? 'high' : 'standard';
      } else if (key === 'rot' || key === 'rot_updated') {
        const num = parseInt(value, 10) || 0;
        if (key === 'rot') {
          const target = cfg.rotTarget || { page: true, image: true };
          if (target.page) cfg.rotPage = num;
          if (target.image) cfg.rotImg = num;
        }
        cfg.rot = num;
        const lblRot = document.getElementById('lblRotationVal');
        if (lblRot) lblRot.textContent = `${num}°`;
      } else if (key === 'orient') {
        cfg.orient = value;
      } else if (key === 'margin') {
        cfg.margin = parseInt(value, 10) || 0;
      } else if (key === 'format') {
        cfg.format = value;
        syncTransparentBgVisibility();
      } else if (key === 'customW') {
        cfg.customW = parseInt(value, 10) || 1920;
      } else if (key === 'customH') {
        cfg.customH = parseInt(value, 10) || 1080;
      }

      await renderMainViewerCanvas(cur);
      updateThumbnailCanvas(cur);
      updateMiniPreview();
    }

    // 개별 페이지 썸네일 캔버스 고해상도 실시간 갱신 (용지 규격 + 여백 + 회전 + 맞춤 비율 즉각 반영)
    async function updateThumbnailCanvas(index) {
      const item = docState.items[index];
      if (!item) return;
      const canvas = document.getElementById(`thumb-canvas-${index}`);
      if (!canvas) return;
      const cfg = getEffectiveItemSettings(index);

      if (item.type === 'pdf' && !item.imgObj) {
        await ensureItemCanvas(item);
      }
      canvas.style.filter = 'none';
      canvas.style.transform = 'none';
      drawPaperWithImage(canvas, item, cfg, { isThumbnail: true });
      const wrap = canvas.closest('.thumb-canvas-wrap');
      const isTransparent = ((cfg.format || 'png') === 'png') && (cfg.transparentBg !== false);
      if (wrap) wrap.classList.toggle('checkerboard-bg', isTransparent);
    }

    // 슬라이더 바 직접 드래그 시 선택된 타겟(페이지 및/또는 이미지)에 각도 즉시 독립 적용
    function onSliderRotationInput(val) {
      const num = parseInt(val, 10) || 0;
      if (typeof handleLayerRotationInput === 'function' && handleLayerRotationInput(num)) return;
      const cur = docState.currentIndex;
      const cfg = getEffectiveItemSettings(cur);
      const target = cfg.rotTarget || { page: true, image: true };

      if (!target.page && !target.image) return;

      if (target.page) cfg.rotPage = num;
      if (target.image) cfg.rotImg = num;
      cfg.rot = num;

      const lblRot = document.getElementById('lblRotationVal');
      if (lblRot) lblRot.textContent = `${num}°`;

      onSettingChange('rot_updated', num);
    }

    // 회전 각도 퀵 조절 유틸리티 (-90°, 0° 초기화, +90°)
    function rotateCurrentByDelta(delta) {
      const cur = docState.currentIndex;
      const cfg = getEffectiveItemSettings(cur);
      const target = cfg.rotTarget || { page: true, image: true };

      if (!target.page && !target.image) return;

      if (target.page) {
        let curPage = parseInt(cfg.rotPage !== undefined ? cfg.rotPage : (cfg.rot || 0), 10) || 0;
        let nextPage = curPage + delta;
        if (nextPage > 180) nextPage -= 360;
        if (nextPage < -180) nextPage += 360;
        cfg.rotPage = nextPage;
      }
      if (target.image) {
        let curImg = parseInt(cfg.rotImg !== undefined ? cfg.rotImg : (cfg.rot || 0), 10) || 0;
        let nextImg = curImg + delta;
        if (nextImg > 180) nextImg -= 360;
        if (nextImg < -180) nextImg += 360;
        cfg.rotImg = nextImg;
      }

      const { rot } = getResolvedRotations(cfg);
      cfg.rot = rot;
      const slider = document.getElementById('sliderRotation');
      if (slider) slider.value = rot;
      const lblRot = document.getElementById('lblRotationVal');
      if (lblRot) lblRot.textContent = `${rot}°`;

      onSettingChange('rot_updated', rot);
    }

    // 0° 초기화 버튼: 오직 사용자가 초기화 버튼을 눌렀을 때만 선택된 대상을 0으로 리셋
    function rotateCurrentTo(val) {
      const cur = docState.currentIndex;
      const cfg = getEffectiveItemSettings(cur);
      const target = cfg.rotTarget || { page: true, image: true };

      if (target.page) cfg.rotPage = val;
      if (target.image) cfg.rotImg = val;

      const { rot } = getResolvedRotations(cfg);
      cfg.rot = rot;
      const slider = document.getElementById('sliderRotation');
      if (slider) slider.value = rot;
      const lblRot = document.getElementById('lblRotationVal');
      if (lblRot) lblRot.textContent = `${rot}°`;

      onSettingChange('rot_updated', rot);
    }
