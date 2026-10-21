    // ==========================================================================
    // [MODULE] 11_layers.js
    // 다중 객체 레이어 엔진 (카멜레온 글상자 v2, 15종 도형 & 5종 선, 이미지/PDF 조각, 정밀 스포이드)
    // ==========================================================================

    let selectedLayerId = null;
    let isEyedropperActive = false;
    let activeEyedropperTarget = null; // 'textColor' | 'textBg' | 'shapeFill' | 'shapeStroke'
    let activeLayerDrag = null; // { mode: 'move'|'resize'|'rot', handle, startX, startY, origLayer, paperRect, centerScreen }
    let layerSeqCounter = 1;

    const SHAPE_NAMES = {
      rect: '직사각형',
      roundRect: '둥근사각',
      ellipse: '원형',
      triangle: '삼각형',
      diamond: '마름모',
      pentagon: '오각형',
      hexagon: '육각형',
      star: '별표',
      heart: '하트',
      noSymbol: '금지',
      line: '직선',
      arrow: '화살표',
      doubleArrow: '양방향화살표',
      callout: '말풍선',
      check: '체크표시',
      cross: '엑스표시'
    };

    function getCurrentItemLayers(pageIdx) {
      const idx = pageIdx !== undefined ? pageIdx : docState.currentIndex;
      const item = docState.items[idx];
      if (!item) return [];
      if (!Array.isArray(item.layers)) {
        item.layers = [];
      }
      return item.layers;
    }

    function getSelectedLayer() {
      if (!selectedLayerId) return null;
      const layers = getCurrentItemLayers();
      const found = layers.find(l => l.id === selectedLayerId);
      if (!found) {
        selectedLayerId = null;
        return null;
      }
      return found;
    }

    function selectLayer(layerId) {
      const prevLayer = getSelectedLayer();
      selectedLayerId = layerId || null;
      const nextLayer = getSelectedLayer();

      // 레이어 변경 시 열려 있던 자르기나 투시변환이 부적절하면 정리
      if (typeof isCropActive !== 'undefined' && isCropActive && typeof cancelCrop === 'function') {
        if (!nextLayer || nextLayer.type !== 'image') {
          cancelCrop();
        }
      }
      if (typeof isPerspectiveActive !== 'undefined' && isPerspectiveActive) {
        if (nextLayer && nextLayer.type !== 'image') {
          const cfg = getEffectiveItemSettings(docState.currentIndex);
          if (cfg) cfg.isPerspectiveActive = false;
          if (typeof syncPerspectiveUI === 'function') syncPerspectiveUI(false);
        } else {
          if (typeof updateCornerPins === 'function') updateCornerPins();
        }
      }

      syncLayerUI();
      updateLayerStageOverlay();

      if (nextLayer) {
        updateStatusMsg(`선택됨: ${nextLayer.name} (드래그 이동 / 모서리 크기·회전 조절)`);
      } else if (prevLayer) {
        updateStatusMsg('바탕 이미지 선택됨');
      }
    }

    // 화면 표시 중인 메인 뷰어 캔버스에서 실제 활성 용지(종이 연동 시 subRect, 일반 시 전체 캔버스) 사각형 반환
    function getActivePaperCanvasRect(canvas, item, cfg) {
      if (!canvas || !item) return { sx: 0, sy: 0, subW: canvas ? canvas.width : 1000, subH: canvas ? canvas.height : 1000 };
      const cW = canvas.width || 1000;
      const cH = canvas.height || 1000;
      const isViewerCrop = (typeof isCropActive !== 'undefined' && isCropActive && !croppingLayerId);
      const isPaperCrop = Boolean(!isViewerCrop && cfg && cfg.crop && cfg.crop.cropPaper);

      if (!isPaperCrop) {
        return { sx: 0, sy: 0, subW: cW, subH: cH };
      }

      const { isPageRot90, isImgRot90 } = getResolvedRotations(cfg);
      const fullW = item.width || (item.imgObj ? (item.imgObj.naturalWidth || item.imgObj.width) : 1200);
      const fullH = item.height || (item.imgObj ? (item.imgObj.naturalHeight || item.imgObj.height) : 1600);
      const orientOpt = cfg.orient || 'auto';
      const marginPx = cfg.margin || 0;
      const sizeKey = cfg.pageSize || cfg.fit || 'original';

      const fullBasePaperW = (isPageRot90 ? fullH : fullW) + marginPx * 2;
      const fullBasePaperH = (isPageRot90 ? fullW : fullH) + marginPx * 2;
      const fullBaseLand = orientOpt === 'l' || (orientOpt === 'auto' && fullW > fullH);
      const fullIsLand = isPageRot90 ? !fullBaseLand : fullBaseLand;
      const fullPaper = resolvePaperGeometry(sizeKey, fullIsLand, fullBasePaperW, fullBasePaperH, cfg.customW, cfg.customH);

      const vM = marginPx * cW / (fullPaper.widthPx || cW);
      const rFW = isImgRot90 ? fullH : fullW;
      const rFH = isImgRot90 ? fullW : fullH;
      const k = Math.min(Math.max(10, cW - vM * 2) / rFW, Math.max(10, cH - vM * 2) / rFH);
      const eff = (typeof getEffectiveImageDimensions === 'function') ? getEffectiveImageDimensions(item) : { width: fullW, height: fullH };
      const subW = Math.max(10, Math.min(cW, Math.round(((isPageRot90 ? eff.height : eff.width) * k) + vM * 2)));
      const subH = Math.max(10, Math.min(cH, Math.round(((isPageRot90 ? eff.width : eff.height) * k) + vM * 2)));
      const sx = Math.round((cW - subW) / 2);
      const sy = Math.round((cH - subH) / 2);
      return { sx, sy, subW, subH };
    }

    // 3개 창 전체 즉시 리렌더링 헬퍼
    async function refreshAllViewsForLayers() {
      const curIdx = docState.currentIndex;
      if (typeof renderMainViewerCanvas === 'function') {
        await renderMainViewerCanvas(curIdx);
      }
      if (typeof updateThumbnailCanvas === 'function') {
        await updateThumbnailCanvas(curIdx);
      }
      if (typeof updateMiniPreview === 'function') {
        updateMiniPreview();
      }
      updateLayerStageOverlay();
      if (typeof isPerspectiveActive !== 'undefined' && isPerspectiveActive && typeof updateCornerPins === 'function') {
        updateCornerPins();
      }
    }

    // --------------------------------------------------------------------------
    // 1. 객체 추가 / 순서 변경 / 복제 / 삭제
    // --------------------------------------------------------------------------

    async function addLayerTextBox() {
      if (docState.items.length === 0) {
        if (typeof showExitToast === 'function') showExitToast('먼저 문서를 불러오거나 빈 페이지를 삽입하세요.');
        return;
      }
      const layers = getCurrentItemLayers();
      const count = layers.filter(l => l.type === 'text').length + 1;
      const offsetStep = ((layers.length % 5) - 2) * 0.03;
      const newLayer = {
        id: 'layer_' + Date.now() + '_' + (layerSeqCounter++),
        type: 'text',
        name: `글상자 ${count}`,
        x: 0.5 + offsetStep,
        y: 0.5 + offsetStep,
        w: 0.34,
        h: 0.09,
        rot: 0,
        text: '텍스트 입력',
        bgMode: 'chameleon', // 'chameleon' | 'solid' | 'transparent'
        bgColor: '#ffffff',
        color: '#1e293b',
        fontFamily: "'Dotum', '돋움', 'Apple SD Gothic Neo', sans-serif",
        fontSize: 28,
        letterSpacing: -1.5,
        bold: false,
        italic: false,
        align: 'left',
        padding: 8,
        lineHeight: 1.35
      };
      layers.push(newLayer);
      selectedLayerId = newLayer.id;
      syncLayerUI();
      await refreshAllViewsForLayers();

      const txtEl = document.getElementById('txtLayerContent');
      if (txtEl && window.innerWidth > 860) {
        txtEl.focus();
        txtEl.select();
      }
      if (typeof showExitToast === 'function') showExitToast('카멜레온 글상자가 추가되었습니다.');
    }

    async function addLayerShape(defaultShape = 'rect') {
      if (docState.items.length === 0) {
        if (typeof showExitToast === 'function') showExitToast('먼저 문서를 불러오거나 빈 페이지를 삽입하세요.');
        return;
      }
      const layers = getCurrentItemLayers();
      const count = layers.filter(l => l.type === 'shape').length + 1;
      const offsetStep = ((layers.length % 5) - 2) * 0.03;
      const newLayer = {
        id: 'layer_' + Date.now() + '_' + (layerSeqCounter++),
        type: 'shape',
        shapeType: defaultShape,
        name: `${SHAPE_NAMES[defaultShape] || '도형'} ${count}`,
        x: 0.5 + offsetStep,
        y: 0.5 + offsetStep,
        w: 0.26,
        h: 0.18,
        rot: 0,
        fillTransparent: true, // 기본: 면색 없음(투명 테두리)
        fillColor: '#fef08a',
        strokeColor: '#dc2626',
        strokeWidth: 4,
        strokeDash: 'solid'
      };
      layers.push(newLayer);
      selectedLayerId = newLayer.id;
      syncLayerUI();
      await refreshAllViewsForLayers();
      if (typeof showExitToast === 'function') showExitToast('도형이 추가되었습니다. 면색/선두께를 자유롭게 조절하세요.');
    }

    function triggerAddLayerFile() {
      if (docState.items.length === 0) {
        if (typeof showExitToast === 'function') showExitToast('먼저 문서를 불러오거나 빈 페이지를 삽입하세요.');
        return;
      }
      const inp = document.getElementById('layerFileInput');
      if (inp) {
        inp.value = '';
        inp.click();
      }
    }

    async function handleLayerFileInput(e) {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length === 0) return;
      e.target.value = '';

      for (const file of files) {
        await addFileAsObjectLayer(file);
      }
    }

    async function addFileAsObjectLayer(file, dropOpts = null) {
      if (!file || docState.items.length === 0) return;
      const curItem = docState.items[docState.currentIndex];
      if (!curItem) return;

      try {
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (isPdf) {
          updateStatusMsg(`PDF 객체 로딩 중: ${file.name}...`);
          const buf = await file.arrayBuffer();
          const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
          if (pdfDoc.numPages > 1 && typeof renderPickerThumbnails === 'function') {
            pickerState.doc = pdfDoc;
            pickerState.file = file;
            pickerState.total = pdfDoc.numPages;
            pickerState.selected = Array.from({ length: pdfDoc.numPages }, (_, i) => i === 0);
            pickerState.mode = 'layer_insert';
            pickerState.dropOpts = dropOpts || null;
            const titleEl = document.getElementById('pickerModalTitle');
            if (titleEl) titleEl.textContent = `📑 현재 페이지에 올릴 PDF 페이지 선택 (${file.name})`;
            const posEl = document.getElementById('pickerTargetPosText');
            if (posEl) posEl.textContent = `삽입 대상: 현재 페이지 (${docState.currentIndex + 1}페이지) 위 다중 객체 레이어`;
            const btnConfirm = document.getElementById('btnConfirmPickerInsert');
            if (btnConfirm) btnConfirm.textContent = '선택한 페이지를 객체로 추가';
            const rangeInput = document.getElementById('txtPickerRange');
            if (rangeInput) rangeInput.value = '';
            const modal = document.getElementById('modalPdfPicker');
            if (modal) modal.classList.add('show');
            updatePickerCount();
            renderPickerThumbnails();
            try { history.pushState({ appLayer: 'pdfPicker' }, ''); } catch (e) {}
            return;
          }
          const page = await pdfDoc.getPage(1);
          const vp = page.getViewport({ scale: 2.5 });
          const offCanvas = document.createElement('canvas');
          offCanvas.width = vp.width;
          offCanvas.height = vp.height;
          const offCtx = offCanvas.getContext('2d');
          offCtx.fillStyle = '#ffffff';
          offCtx.fillRect(0, 0, vp.width, vp.height);
          await page.render({ canvasContext: offCtx, viewport: vp }).promise;

          await insertImageCanvasAsLayer(offCanvas, file.name.replace(/\.[^/.]+$/, '') + ' (p.1)', dropOpts);
        } else if (/\.tiff?$/i.test(file.name) && typeof UTIF !== 'undefined') {
          const buf = await file.arrayBuffer();
          const ifds = UTIF.decode(buf);
          if (ifds && ifds.length > 0) {
            UTIF.decodeImage(buf, ifds[0]);
            const rgba = UTIF.toRGBA8(ifds[0]);
            const c = document.createElement('canvas');
            c.width = ifds[0].width;
            c.height = ifds[0].height;
            const ctx = c.getContext('2d');
            const imgData = new ImageData(new Uint8ClampedArray(rgba), c.width, c.height);
            ctx.putImageData(imgData, 0, 0);
            await insertImageCanvasAsLayer(c, file.name, dropOpts);
          }
        } else {
          const blobUrl = URL.createObjectURL(file);
          const img = new Image();
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
            img.src = blobUrl;
          });
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || img.width || 800;
          c.height = img.naturalHeight || img.height || 600;
          c.getContext('2d').drawImage(img, 0, 0);
          URL.revokeObjectURL(blobUrl);
          await insertImageCanvasAsLayer(c, file.name, dropOpts);
        }
      } catch (err) {
        console.error('[Layer File Load Error]', err);
        if (typeof showExitToast === 'function') showExitToast(`객체 추가 실패: ${err.message}`);
      }
    }

    async function insertImageCanvasAsLayer(imgCanvas, labelName, dropOpts = null) {
      const layers = getCurrentItemLayers();
      const count = layers.filter(l => l.type === 'image').length + 1;
      const origW = imgCanvas.width || 800;
      const origH = imgCanvas.height || 600;

      const mainCanvas = document.getElementById('mainViewerCanvas');
      const paperRatio = (mainCanvas && mainCanvas.width && mainCanvas.height) ? (mainCanvas.width / mainCanvas.height) : 0.707;
      const imgRatio = origW / origH;

      let w = 0.42;
      let h = (w * paperRatio) / imgRatio;
      if (h > 0.45) {
        h = 0.45;
        w = (h * imgRatio) / paperRatio;
      }

      const offsetStep = ((layers.length % 5) - 2) * 0.03;
      let targetX = 0.5 + offsetStep;
      let targetY = 0.5 + offsetStep;

      // 가운데 창에 직접 드래그 앤 드롭한 경우 드롭한 마우스 위치에 배치
      if (dropOpts && typeof dropOpts.dropClientX === 'number' && typeof dropOpts.dropClientY === 'number' && mainCanvas) {
        const rect = mainCanvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 &&
            dropOpts.dropClientX >= rect.left && dropOpts.dropClientX <= rect.right &&
            dropOpts.dropClientY >= rect.top && dropOpts.dropClientY <= rect.bottom) {
          const item = docState.items[docState.currentIndex];
          const cfg = getEffectiveItemSettings(docState.currentIndex);
          const paperRect = getActivePaperCanvasRect(mainCanvas, item, cfg);
          const canvX = ((dropOpts.dropClientX - rect.left) / rect.width) * mainCanvas.width;
          const canvY = ((dropOpts.dropClientY - rect.top) / rect.height) * mainCanvas.height;
          targetX = Math.max(0.08, Math.min(0.92, (canvX - paperRect.sx) / Math.max(1, paperRect.subW)));
          targetY = Math.max(0.08, Math.min(0.92, (canvY - paperRect.sy) / Math.max(1, paperRect.subH)));
        }
      }

      const newLayer = {
        id: 'layer_' + Date.now() + '_' + (layerSeqCounter++),
        type: 'image',
        name: labelName ? `그림 ${count} (${labelName.slice(0, 10)})` : `이미지 조각 ${count}`,
        imgObj: imgCanvas,
        origW: origW,
        origH: origH,
        x: targetX,
        y: targetY,
        w: Math.max(0.08, Math.min(0.9, w)),
        h: Math.max(0.08, Math.min(0.9, h)),
        rot: 0,
        brightness: 100,
        contrast: 100,
        crop: null,
        corners: {
          tl: { x: 0, y: 0 },
          tr: { x: 0, y: 0 },
          br: { x: 0, y: 0 },
          bl: { x: 0, y: 0 }
        },
        trapExp: { top: 0, bot: 0 }
      };

      layers.push(newLayer);
      selectedLayerId = newLayer.id;
      syncLayerUI();
      await refreshAllViewsForLayers();
      if (typeof showExitToast === 'function') showExitToast('이미지/PDF 조각이 현재 페이지 객체로 추가되었습니다.');
    }

    async function moveSelectedLayerOrder(dir) {
      const layers = getCurrentItemLayers();
      if (!selectedLayerId || layers.length <= 1) return;
      const idx = layers.findIndex(l => l.id === selectedLayerId);
      if (idx < 0) return;

      const [target] = layers.splice(idx, 1);
      if (dir === 'front') {
        layers.push(target);
      } else if (dir === 'back') {
        layers.unshift(target);
      } else if (dir === 'up') {
        layers.splice(Math.min(layers.length, idx + 1), 0, target);
      } else if (dir === 'down') {
        layers.splice(Math.max(0, idx - 1), 0, target);
      }
      syncLayerUI();
      await refreshAllViewsForLayers();
    }

    async function duplicateSelectedLayer() {
      const sel = getSelectedLayer();
      if (!sel) return;
      const layers = getCurrentItemLayers();
      const clone = Object.assign({}, JSON.parse(JSON.stringify({
        ...sel,
        imgObj: undefined,
        _croppedCanvas: undefined
      })));
      clone.id = 'layer_' + Date.now() + '_' + (layerSeqCounter++);
      clone.name = sel.name + ' 사본';
      clone.x = Math.min(0.92, sel.x + 0.04);
      clone.y = Math.min(0.92, sel.y + 0.04);
      if (sel.type === 'image' && sel.imgObj) {
        clone.imgObj = sel.imgObj;
      }
      layers.push(clone);
      selectedLayerId = clone.id;
      syncLayerUI();
      await refreshAllViewsForLayers();
      if (typeof showExitToast === 'function') showExitToast('객체가 복제되었습니다.');
    }

    async function deleteSelectedLayer() {
      const sel = getSelectedLayer();
      if (!sel) return;
      const layers = getCurrentItemLayers();
      const idx = layers.findIndex(l => l.id === sel.id);
      if (idx >= 0) {
        layers.splice(idx, 1);
      }
      selectedLayerId = null;
      if (typeof isCropActive !== 'undefined' && isCropActive && typeof cancelCrop === 'function') {
        await cancelCrop();
      }
      syncLayerUI();
      await refreshAllViewsForLayers();
      if (typeof showExitToast === 'function') showExitToast('선택한 객체가 삭제되었습니다.');
    }

    // --------------------------------------------------------------------------
    // 2. 우측 패널 레이어 칩 & 인스펙터 UI 동기화
    // --------------------------------------------------------------------------

    function syncLayerUI() {
      const layers = getCurrentItemLayers();
      const sel = getSelectedLayer();

      const mgrBar = document.getElementById('layerManagerBar');
      const chipsList = document.getElementById('layerChipsList');
      const orderActions = document.getElementById('layerOrderActions');
      const inspText = document.getElementById('layerInspectorText');
      const inspShape = document.getElementById('layerInspectorShape');

      if (mgrBar && chipsList) {
        // 삽입된 객체 칩 목록 위에서 마우스 휠로 가로 스크롤 지원 (1회 바인딩)
        if (!chipsList.dataset.wheelBound) {
          chipsList.dataset.wheelBound = '1';
          chipsList.addEventListener('wheel', (e) => {
            if (chipsList.scrollWidth > chipsList.clientWidth) {
              e.preventDefault();
              chipsList.scrollLeft += (e.deltaY !== 0 ? e.deltaY : e.deltaX);
            }
          }, { passive: false });
        }

        if (layers.length === 0) {
          mgrBar.style.display = 'none';
        } else {
          mgrBar.style.display = 'flex';
          chipsList.innerHTML = '';

          // 1) 바탕 이미지 칩
          const baseChip = document.createElement('button');
          baseChip.type = 'button';
          baseChip.className = 'layer-chip' + (!sel ? ' active' : '');
          baseChip.textContent = '📄 바탕 이미지';
          baseChip.onclick = () => selectLayer(null);
          chipsList.appendChild(baseChip);

          // 2) 각 객체 레이어 칩
          layers.forEach((layer) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'layer-chip' + (sel && sel.id === layer.id ? ' active' : '');
            const icon = layer.type === 'text' ? '🔤' : (layer.type === 'shape' ? '⭐' : '🖼️');
            chip.textContent = `${icon} ${layer.name}`;
            chip.onclick = () => selectLayer(layer.id);
            chipsList.appendChild(chip);
          });
        }
      }

      if (orderActions) {
        orderActions.style.display = sel ? 'flex' : 'none';
      }

      // 회전 슬라이더를 현재 선택된 레이어(또는 바탕 이미지) 각도로 동기화
      const sliderRot = document.getElementById('sliderRotation');
      const lblRot = document.getElementById('lblRotationVal');
      if (sel) {
        const r = Math.round(sel.rot || 0);
        if (sliderRot) sliderRot.value = r;
        if (lblRot) lblRot.textContent = `${r}°`;
      } else {
        const cfg = getEffectiveItemSettings(docState.currentIndex);
        const r = cfg ? (cfg.rotImg || cfg.rot || 0) : 0;
        if (sliderRot) sliderRot.value = r;
        if (lblRot) lblRot.textContent = `${r}°`;
      }

      // 글상자 인스펙터 동기화
      if (inspText) {
        if (sel && sel.type === 'text') {
          inspText.style.display = 'flex';
          const txtEl = document.getElementById('txtLayerContent');
          if (txtEl && document.activeElement !== txtEl) {
            txtEl.value = sel.text || '';
          }
          const bgMode = sel.bgMode || 'chameleon';
          document.getElementById('btnTextBgChameleon')?.classList.toggle('active', bgMode === 'chameleon');
          document.getElementById('btnTextBgSolid')?.classList.toggle('active', bgMode === 'solid');
          document.getElementById('btnTextBgTrans')?.classList.toggle('active', bgMode === 'transparent');

          const grpBgPick = document.getElementById('grpTextBgColorPick');
          if (grpBgPick) {
            grpBgPick.style.opacity = bgMode === 'solid' ? '1' : '0.55';
          }

          const clrText = document.getElementById('clrLayerTextColor');
          if (clrText) clrText.value = sel.color || '#1e293b';
          const clrBg = document.getElementById('clrLayerBgColor');
          if (clrBg) clrBg.value = sel.bgColor || '#ffffff';

          const selFont = document.getElementById('selLayerFontFamily');
          if (selFont && sel.fontFamily) selFont.value = sel.fontFamily;
          const numSize = document.getElementById('numLayerFontSize');
          if (numSize && document.activeElement !== numSize) numSize.value = sel.fontSize || 28;

          document.getElementById('btnTextBold')?.classList.toggle('active', Boolean(sel.bold));
          document.getElementById('btnTextItalic')?.classList.toggle('active', Boolean(sel.italic));
          const align = sel.align || 'left';
          document.getElementById('btnTextAlignL')?.classList.toggle('active', align === 'left');
          document.getElementById('btnTextAlignC')?.classList.toggle('active', align === 'center');
          document.getElementById('btnTextAlignR')?.classList.toggle('active', align === 'right');

          const selLS = document.getElementById('selLayerLetterSpacing');
          if (selLS) selLS.value = String(sel.letterSpacing !== undefined ? sel.letterSpacing : -1.5);

          const selPad = document.getElementById('selLayerPadding');
          if (selPad) selPad.value = String(sel.padding !== undefined ? sel.padding : 8);
        } else {
          inspText.style.display = 'none';
        }
      }

      // 도형 인스펙터 동기화
      if (inspShape) {
        if (sel && sel.type === 'shape') {
          inspShape.style.display = 'flex';
          document.querySelectorAll('#shapeTypeGrid .btn-shape-type').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.shape === sel.shapeType);
          });
          const chkTrans = document.getElementById('chkShapeFillTrans');
          if (chkTrans) chkTrans.checked = Boolean(sel.fillTransparent);
          const grpFill = document.getElementById('grpShapeFillColor');
          if (grpFill) grpFill.style.opacity = sel.fillTransparent ? '0.45' : '1';

          const clrFill = document.getElementById('clrShapeFillColor');
          if (clrFill) clrFill.value = sel.fillColor || '#fef08a';
          const clrStroke = document.getElementById('clrShapeStrokeColor');
          if (clrStroke) clrStroke.value = sel.strokeColor || '#dc2626';

          const selDash = document.getElementById('selShapeStrokeDash');
          if (selDash) selDash.value = sel.strokeDash || 'solid';
          const rngW = document.getElementById('rngShapeStrokeWidth');
          if (rngW) rngW.value = sel.strokeWidth !== undefined ? sel.strokeWidth : 4;
          const lblW = document.getElementById('lblShapeStrokeWidth');
          if (lblW) lblW.textContent = `${sel.strokeWidth !== undefined ? sel.strokeWidth : 4}px`;
        } else {
          inspShape.style.display = 'none';
        }
      }
    }

    // 글상자 속성 변경 핸들러
    async function onTextLayerPropChange(prop, val) {
      const sel = getSelectedLayer();
      if (!sel || sel.type !== 'text') return;

      if (prop === 'fontSize') {
        sel.fontSize = Math.max(6, Math.min(250, parseInt(val, 10) || 28));
      } else if (prop === 'letterSpacing') {
        sel.letterSpacing = parseFloat(val);
        if (isNaN(sel.letterSpacing)) sel.letterSpacing = 0;
      } else if (prop === 'padding') {
        sel.padding = parseInt(val, 10) || 0;
      } else if (prop === 'bgColor') {
        sel.bgColor = val;
        if (sel.bgMode !== 'solid') sel.bgMode = 'solid';
      } else {
        sel[prop] = val;
      }
      syncLayerUI();
      await refreshAllViewsForLayers();
    }

    async function stepTextLayerFontSize(delta) {
      const sel = getSelectedLayer();
      if (!sel || sel.type !== 'text') return;
      sel.fontSize = Math.max(6, Math.min(250, (sel.fontSize || 28) + delta));
      syncLayerUI();
      await refreshAllViewsForLayers();
    }

    async function toggleTextLayerStyle(prop) {
      const sel = getSelectedLayer();
      if (!sel || sel.type !== 'text') return;
      sel[prop] = !sel[prop];
      syncLayerUI();
      await refreshAllViewsForLayers();
    }

    // 자간(letterSpacing) 반영 문자열 폭 측정 & 렌더링 헬퍼
    function measureSpacedText(ctx, str, lsPx) {
      if (!str) return 0;
      if (!lsPx || Math.abs(lsPx) < 0.05 || str.length <= 1) {
        return ctx.measureText(str).width;
      }
      let total = 0;
      for (let i = 0; i < str.length; i++) {
        total += ctx.measureText(str[i]).width;
      }
      return Math.max(1, total + lsPx * (str.length - 1));
    }

    function fillSpacedText(ctx, str, x, y, align, lsPx) {
      if (!str) return;
      if (!lsPx || Math.abs(lsPx) < 0.05 || str.length <= 1) {
        ctx.textAlign = align || 'left';
        ctx.fillText(str, x, y);
        return;
      }
      const totalW = measureSpacedText(ctx, str, lsPx);
      let curX = x;
      if (align === 'center') curX = x - totalW / 2;
      else if (align === 'right') curX = x - totalW;
      ctx.textAlign = 'left';
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        ctx.fillText(ch, curX, y);
        curX += ctx.measureText(ch).width + lsPx;
      }
    }

    // 글자 길이에 맞춰 글상자 크기 자동 맞춤
    async function fitTextLayerBox() {
      const sel = getSelectedLayer();
      if (!sel || sel.type !== 'text') return;
      const canvas = document.getElementById('mainViewerCanvas');
      if (!canvas || !canvas.width || !canvas.height) return;

      const item = docState.items[docState.currentIndex];
      const cfg = getEffectiveItemSettings(docState.currentIndex);
      const paperRect = getActivePaperCanvasRect(canvas, item, cfg);
      const refShort = Math.min(paperRect.subW, paperRect.subH);
      const refScale = refShort / 1000;

      const fontPx = Math.max(8, (sel.fontSize || 28) * refScale);
      const padPx = (sel.padding !== undefined ? sel.padding : 8) * refScale;
      const lsPx = (sel.letterSpacing !== undefined ? sel.letterSpacing : -1.5) * refScale;
      const lineH = fontPx * (sel.lineHeight || 1.35);

      const ctx = canvas.getContext('2d');
      ctx.save();
      const styleStr = `${sel.italic ? 'italic ' : ''}${sel.bold ? 'bold ' : ''}${fontPx}px ${sel.fontFamily || 'sans-serif'}`;
      ctx.font = styleStr;
      const rawLines = String(sel.text || ' ').split(/\r?\n/);
      let maxW = 40;
      rawLines.forEach(line => {
        const w = measureSpacedText(ctx, line || ' ', lsPx);
        if (w > maxW) maxW = w;
      });
      ctx.restore();

      const targetW = maxW + padPx * 2.4 + 12;
      const targetH = rawLines.length * lineH + padPx * 2.2;

      sel.w = Math.max(0.05, Math.min(0.98, targetW / paperRect.subW));
      sel.h = Math.max(0.03, Math.min(0.98, targetH / paperRect.subH));
      await refreshAllViewsForLayers();
    }

    // 도형 속성 변경 핸들러
    async function onShapeLayerPropChange(prop, val) {
      const sel = getSelectedLayer();
      if (!sel || sel.type !== 'shape') return;

      if (prop === 'shapeType') {
        sel.shapeType = val;
        const numMatch = sel.name.match(/\d+$/);
        const numStr = numMatch ? ' ' + numMatch[0] : '';
        sel.name = (SHAPE_NAMES[val] || '도형') + numStr;
      } else if (prop === 'strokeWidth') {
        sel.strokeWidth = Math.max(0, Math.min(40, parseInt(val, 10) || 0));
      } else if (prop === 'fillColor') {
        sel.fillColor = val;
        sel.fillTransparent = false;
      } else {
        sel[prop] = val;
      }
      syncLayerUI();
      await refreshAllViewsForLayers();
    }

    // --------------------------------------------------------------------------
    // 3. 기존 [객체 설정] 버튼들과 선택된 레이어 연동 훅 (크기/비율/이동/회전/필터/투시)
    // --------------------------------------------------------------------------

    function handleLayerScale(delta) {
      const sel = getSelectedLayer();
      if (!sel) return false;
      const factor = Math.max(0.5, 1 + delta);
      sel.w = Math.max(0.03, Math.min(1.8, sel.w * factor));
      sel.h = Math.max(0.03, Math.min(1.8, sel.h * factor));
      if (sel.type === 'text') {
        sel.fontSize = Math.max(6, Math.min(250, Math.round((sel.fontSize || 28) * factor)));
        syncLayerUI();
      }
      refreshAllViewsForLayers();
      return true;
    }

    function handleLayerResetScale() {
      const sel = getSelectedLayer();
      if (!sel) return false;
      if (sel.type === 'text') {
        sel.w = 0.34; sel.h = 0.09; sel.fontSize = 28;
        syncLayerUI();
      } else if (sel.type === 'shape') {
        sel.w = 0.26; sel.h = 0.18;
      } else if (sel.type === 'image') {
        sel.w = 0.42; sel.h = 0.32;
      }
      refreshAllViewsForLayers();
      return true;
    }

    function handleLayerScaleX(delta) {
      const sel = getSelectedLayer();
      if (!sel) return false;
      sel.w = Math.max(0.03, Math.min(1.8, sel.w * (1 + delta)));
      refreshAllViewsForLayers();
      return true;
    }

    function handleLayerResetScaleX() {
      const sel = getSelectedLayer();
      if (!sel) return false;
      if (sel.type === 'image' && sel.origW && sel.origH) {
        const canvas = document.getElementById('mainViewerCanvas');
        const pRatio = (canvas && canvas.width && canvas.height) ? (canvas.width / canvas.height) : 0.707;
        sel.w = (sel.h * (sel.origW / sel.origH)) / pRatio;
      } else {
        sel.w = sel.h * 1.4;
      }
      refreshAllViewsForLayers();
      return true;
    }

    function handleLayerTrapezoid(mode) {
      const sel = getSelectedLayer();
      if (!sel) return false;
      if (sel.type !== 'image') {
        if (typeof showExitToast === 'function') showExitToast('사다리꼴/투시 변형은 이미지·PDF 객체에서 지원됩니다.');
        return true;
      }
      if (!sel.trapExp) sel.trapExp = { top: 0, bot: 0 };
      const stepPx = Math.max(1, Math.round((sel.origW || 800) * 0.01));
      if (mode === 'top' || mode > 0) sel.trapExp.top = (sel.trapExp.top || 0) + stepPx;
      else if (mode === 'bot' || mode < 0) sel.trapExp.bot = (sel.trapExp.bot || 0) + stepPx;
      refreshAllViewsForLayers();
      return true;
    }

    function handleLayerResetTrapezoid() {
      const sel = getSelectedLayer();
      if (!sel) return false;
      if (sel.type === 'image') {
        sel.trapExp = { top: 0, bot: 0 };
        refreshAllViewsForLayers();
      }
      return true;
    }

    function handleLayerBrightness(delta) {
      const sel = getSelectedLayer();
      if (!sel) return false;
      if (sel.type === 'image') {
        sel.brightness = Math.max(20, Math.min(250, (sel.brightness || 100) + delta));
        refreshAllViewsForLayers();
      }
      return true;
    }

    function handleLayerResetBrightness() {
      const sel = getSelectedLayer();
      if (!sel) return false;
      if (sel.type === 'image') {
        sel.brightness = 100;
        refreshAllViewsForLayers();
      }
      return true;
    }

    function handleLayerContrast(delta) {
      const sel = getSelectedLayer();
      if (!sel) return false;
      if (sel.type === 'image') {
        sel.contrast = Math.max(20, Math.min(250, (sel.contrast || 100) + delta));
        refreshAllViewsForLayers();
      }
      return true;
    }

    function handleLayerResetContrast() {
      const sel = getSelectedLayer();
      if (!sel) return false;
      if (sel.type === 'image') {
        sel.contrast = 100;
        refreshAllViewsForLayers();
      }
      return true;
    }

    function handleLayerOffset(pixelDx, pixelDy) {
      const sel = getSelectedLayer();
      if (!sel) return false;
      const mainCanvas = document.getElementById('mainViewerCanvas');
      const cw = (mainCanvas && mainCanvas.width) ? mainCanvas.width : 1200;
      const ch = (mainCanvas && mainCanvas.height) ? mainCanvas.height : 1200;
      sel.x = Math.max(-0.5, Math.min(1.5, sel.x + (pixelDx / cw)));
      sel.y = Math.max(-0.5, Math.min(1.5, sel.y + (pixelDy / ch)));
      refreshAllViewsForLayers();
      return true;
    }

    function handleLayerResetOffset() {
      const sel = getSelectedLayer();
      if (!sel) return false;
      sel.x = 0.5;
      sel.y = 0.5;
      refreshAllViewsForLayers();
      return true;
    }

    function handleLayerRotationInput(num) {
      const sel = getSelectedLayer();
      if (!sel) return false;
      sel.rot = num;
      const lblRot = document.getElementById('lblRotationVal');
      if (lblRot) lblRot.textContent = `${num}°`;
      refreshAllViewsForLayers();
      return true;
    }

    function handleLayerRotateByDelta(delta) {
      const sel = getSelectedLayer();
      if (!sel) return false;
      let next = Math.round(sel.rot || 0) + delta;
      if (next > 180) next -= 360;
      if (next <= -180) next += 360;
      sel.rot = next;
      syncLayerUI();
      refreshAllViewsForLayers();
      return true;
    }

    function handleLayerRotateTo(val) {
      const sel = getSelectedLayer();
      if (!sel) return false;
      sel.rot = val;
      syncLayerUI();
      refreshAllViewsForLayers();
      return true;
    }

    async function handleLayerResetCorners() {
      const sel = getSelectedLayer();
      if (!sel || sel.type !== 'image') return false;
      sel.corners = {
        tl: { x: 0, y: 0 },
        tr: { x: 0, y: 0 },
        br: { x: 0, y: 0 },
        bl: { x: 0, y: 0 }
      };
      await refreshAllViewsForLayers();
      return true;
    }

    // --------------------------------------------------------------------------
    // 4. 이미지/PDF 레이어 전용 크롭 & 4코너 투시변환 좌표 산출
    // --------------------------------------------------------------------------

    function getLayerEffectiveImageSource(layer, ignoreCrop = false) {
      if (!layer || !layer.imgObj) return null;
      if (ignoreCrop || !layer.crop) return layer.imgObj;
      const crop = layer.crop;
      if (crop.w >= 0.995 && crop.h >= 0.995 && crop.x <= 0.005 && crop.y <= 0.005) {
        return layer.imgObj;
      }
      const origW = layer.imgObj.naturalWidth || layer.imgObj.width || layer.origW || 800;
      const origH = layer.imgObj.naturalHeight || layer.imgObj.height || layer.origH || 600;
      const sx = Math.max(0, Math.round(crop.x * origW));
      const sy = Math.max(0, Math.round(crop.y * origH));
      const sw = Math.max(1, Math.min(origW - sx, Math.round(crop.w * origW)));
      const sh = Math.max(1, Math.min(origH - sy, Math.round(crop.h * origH)));

      const key = `${sx}_${sy}_${sw}_${sh}`;
      if (layer._croppedCanvas && layer._croppedCanvas.width === sw && layer._croppedCanvas.height === sh && layer._croppedKey === key) {
        return layer._croppedCanvas;
      }
      const c = document.createElement('canvas');
      c.width = sw;
      c.height = sh;
      c.getContext('2d').drawImage(layer.imgObj, sx, sy, sw, sh, 0, 0, sw, sh);
      layer._croppedCanvas = c;
      layer._croppedKey = key;
      return c;
    }

    function getLayerCornerCanvasPoints(item, cfg, layer, canvasW, canvasH) {
      if (!layer || layer.type !== 'image' || !layer.imgObj) return null;
      const canvas = document.getElementById('mainViewerCanvas');
      const paperRect = getActivePaperCanvasRect(canvas || { width: canvasW, height: canvasH }, item, cfg);

      const cx = paperRect.sx + layer.x * paperRect.subW;
      const cy = paperRect.sy + layer.y * paperRect.subH;
      const boxW = Math.max(10, layer.w * paperRect.subW);
      const boxH = Math.max(10, layer.h * paperRect.subH);
      const rotRad = ((layer.rot || 0) * Math.PI) / 180;

      const isCroppingThisLayer = (typeof isCropActive !== 'undefined' && isCropActive && croppingLayerId === layer.id);
      let dx = -boxW / 2;
      let dy = -boxH / 2;
      let dw = boxW;
      let dh = boxH;

      if (!isCroppingThisLayer && layer.crop) {
        dx = -boxW / 2 + boxW * (layer.crop.x || 0);
        dy = -boxH / 2 + boxH * (layer.crop.y || 0);
        dw = boxW * (layer.crop.w !== undefined ? layer.crop.w : 1);
        dh = boxH * (layer.crop.h !== undefined ? layer.crop.h : 1);
      }

      const effSrc = getLayerEffectiveImageSource(layer, isCroppingThisLayer);
      const srcW = effSrc.naturalWidth || effSrc.width || dw;
      const srcH = effSrc.naturalHeight || effSrc.height || dh;
      const scalePxX = dw / srcW;
      const scalePxY = dh / srcH;

      const { topExp, botExp } = resolveTrapezoidExpands(layer.trapExp, dw, scalePxX);
      const trapTopOffset = topExp / 2;
      const trapBotOffset = botExp / 2;
      const c = layer.corners || { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } };

      const pLocal = {
        tl: { x: dx - trapTopOffset + ((c.tl?.x || 0) * scalePxX), y: dy + ((c.tl?.y || 0) * scalePxY) },
        tr: { x: dx + dw + trapTopOffset + ((c.tr?.x || 0) * scalePxX), y: dy + ((c.tr?.y || 0) * scalePxY) },
        br: { x: dx + dw + trapBotOffset + ((c.br?.x || 0) * scalePxX), y: dy + dh + ((c.br?.y || 0) * scalePxY) },
        bl: { x: dx - trapBotOffset + ((c.bl?.x || 0) * scalePxX), y: dy + dh + ((c.bl?.y || 0) * scalePxY) }
      };

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
        rotRad,
        subRect: (paperRect.sx > 0 || paperRect.sy > 0) ? paperRect : null
      };
    }

    // --------------------------------------------------------------------------
    // 5. 마스터 렌더러 연동: 카멜레온 글상자 v2 / 15종 도형 / 이미지 조각 렌더링
    // --------------------------------------------------------------------------

    function renderItemLayers(ctx, canvasW, canvasH, item, cfg, options = {}) {
      if (!ctx || !item || !Array.isArray(item.layers) || item.layers.length === 0) return;

      const refShort = Math.min(canvasW, canvasH);
      const refScale = refShort / 1000; // 1000px 기준 정규화 배율 (썸네일·메인뷰어·인쇄·PDF/Img 내보내기 100% 동일 비율 보장)
      const isMainViewer = (ctx.canvas && ctx.canvas.id === 'mainViewerCanvas');

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, canvasW, canvasH);
      ctx.clip();

      for (let i = 0; i < item.layers.length; i++) {
        const layer = item.layers[i];
        if (!layer) continue;

        const cx = layer.x * canvasW;
        const cy = layer.y * canvasH;
        const boxW = Math.max(4, layer.w * canvasW);
        const boxH = Math.max(4, layer.h * canvasH);
        const rotRad = ((layer.rot || 0) * Math.PI) / 180;

        if (layer.type === 'text') {
          drawTextLayerOnCanvas(ctx, canvasW, canvasH, layer, cx, cy, boxW, boxH, rotRad, refScale);
        } else if (layer.type === 'shape') {
          drawShapeLayerOnCanvas(ctx, layer, cx, cy, boxW, boxH, rotRad, refScale);
        } else if (layer.type === 'image' && layer.imgObj) {
          drawImageLayerOnCanvas(ctx, layer, cx, cy, boxW, boxH, rotRad, isMainViewer);
        }
      }

      ctx.restore();
    }

    // [핵심] 카멜레온 위장 배경 인페인팅 (15곳 5x3 다중 구역 배경색 샘플링 + 글자/표선 노이즈 배제 + 구간별 양선형 보간 합성)
    function drawChameleonBackground(ctx, canvasW, canvasH, cx, cy, boxW, boxH, rotRad) {
      try {
        const cos = Math.cos(rotRad);
        const sin = Math.sin(rotRad);
        const hw = boxW / 2;
        const hh = boxH / 2;

        // 로컬 좌표 (lx, ly)를 캔버스 픽셀 좌표로 변환하여 주변 샘플 추출
        const cornersLocal = [
          { x: -hw, y: -hh },
          { x: hw, y: -hh },
          { x: hw, y: hh },
          { x: -hw, y: hh }
        ];
        const cornersCanv = cornersLocal.map(p => ({
          x: cx + p.x * cos - p.y * sin,
          y: cy + p.x * sin + p.y * cos
        }));

        const pad = Math.max(3, Math.round(Math.min(boxW, boxH) * 0.12));
        const minX = Math.max(0, Math.floor(Math.min(...cornersCanv.map(p => p.x)) - pad));
        const minY = Math.max(0, Math.floor(Math.min(...cornersCanv.map(p => p.y)) - pad));
        const maxX = Math.min(canvasW - 1, Math.ceil(Math.max(...cornersCanv.map(p => p.x)) + pad));
        const maxY = Math.min(canvasH - 1, Math.ceil(Math.max(...cornersCanv.map(p => p.y)) + pad));
        const rw = Math.max(1, maxX - minX + 1);
        const rh = Math.max(1, maxY - minY + 1);

        const imgData = ctx.getImageData(minX, minY, rw, rh).data;

        // 지정된 로컬 사각형 구역(lx0~lx1, ly0~ly1)에서 글자 획/표선을 배제한 순수 배경색 추출
        function sampleRegionCleanColor(lx0, ly0, lx1, ly1) {
          const samples = [];
          const stepsX = 7;
          const stepsY = 5;
          for (let sy = 0; sy <= stepsY; sy++) {
            const ly = ly0 + (ly1 - ly0) * (sy / stepsY);
            for (let sx = 0; sx <= stepsX; sx++) {
              const lx = lx0 + (lx1 - lx0) * (sx / stepsX);
              const px = Math.round(cx + lx * cos - ly * sin) - minX;
              const py = Math.round(cy + lx * sin + ly * cos) - minY;
              if (px >= 0 && px < rw && py >= 0 && py < rh) {
                const idx = (py * rw + px) * 4;
                const a = imgData[idx + 3];
                if (a > 10) {
                  const r = imgData[idx];
                  const g = imgData[idx + 1];
                  const b = imgData[idx + 2];
                  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                  samples.push({ r, g, b, lum });
                }
              }
            }
          }
          if (samples.length === 0) return { r: 255, g: 255, b: 255 };

          // 어두운 글자 획이나 표 테두리선(Outlier)을 배제하기 위해 밝기 상위 55~90% 구간의 대표 배경색 평균 산출
          samples.sort((a, b) => a.lum - b.lum);
          const startIdx = Math.floor(samples.length * 0.55);
          const endIdx = Math.max(startIdx + 1, Math.ceil(samples.length * 0.90));
          let sr = 0, sg = 0, sb = 0, cnt = 0;
          for (let i = startIdx; i < endIdx && i < samples.length; i++) {
            sr += samples[i].r;
            sg += samples[i].g;
            sb += samples[i].b;
            cnt++;
          }
          return {
            r: Math.round(sr / cnt),
            g: Math.round(sg / cnt),
            b: Math.round(sb / cnt)
          };
        }

        // 5x3 (총 15곳) 다중 제어점 격자에서 배경색 샘플링
        const nodesX = 5; // 가로 5구간 제어점 (좌끝 ~ 우끝)
        const nodesY = 3; // 세로 3구간 제어점 (상단, 중단, 하단)
        const totalSpanW = boxW + pad * 1.4;
        const totalSpanH = boxH + pad * 1.4;
        const winW = totalSpanW / (nodesX - 1);
        const winH = totalSpanH / (nodesY - 1);

        const nodeColors = [];
        for (let ny = 0; ny < nodesY; ny++) {
          const row = [];
          const cyLocal = -hh - pad * 0.4 + (ny / (nodesY - 1)) * (boxH + pad * 0.8);
          for (let nx = 0; nx < nodesX; nx++) {
            const cxLocal = -hw - pad * 0.4 + (nx / (nodesX - 1)) * (boxW + pad * 0.8);
            row.push(sampleRegionCleanColor(
              cxLocal - winW * 0.55,
              cyLocal - winH * 0.55,
              cxLocal + winW * 0.55,
              cyLocal + winH * 0.55
            ));
          }
          nodeColors.push(row);
        }

        // 구간별 양선형 보간(Piecewise Bilinear Patch)으로 24x12 고밀도 격자 채우기
        const gridX = 24;
        const gridY = 12;
        const cellW = boxW / gridX;
        const cellH = boxH / gridY;

        for (let gy = 0; gy < gridY; gy++) {
          const vTotal = (gy + 0.5) / gridY * (nodesY - 1);
          const iy = Math.min(nodesY - 2, Math.floor(vTotal));
          const v = vTotal - iy;

          for (let gx = 0; gx < gridX; gx++) {
            const uTotal = (gx + 0.5) / gridX * (nodesX - 1);
            const ix = Math.min(nodesX - 2, Math.floor(uTotal));
            const u = uTotal - ix;

            const cTL = nodeColors[iy][ix];
            const cTR = nodeColors[iy][ix + 1];
            const cBL = nodeColors[iy + 1][ix];
            const cBR = nodeColors[iy + 1][ix + 1];

            const r = Math.round((1 - u) * (1 - v) * cTL.r + u * (1 - v) * cTR.r + (1 - u) * v * cBL.r + u * v * cBR.r);
            const g = Math.round((1 - u) * (1 - v) * cTL.g + u * (1 - v) * cTR.g + (1 - u) * v * cBL.g + u * v * cBR.g);
            const b = Math.round((1 - u) * (1 - v) * cTL.b + u * (1 - v) * cTR.b + (1 - u) * v * cBL.b + u * v * cBR.b);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(-hw + gx * cellW - 0.5, -hh + gy * cellH - 0.5, cellW + 1, cellH + 1);
          }
        }
      } catch (e) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);
      }
    }

    function drawTextLayerOnCanvas(ctx, canvasW, canvasH, layer, cx, cy, boxW, boxH, rotRad, refScale) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotRad);

      const bgMode = layer.bgMode || 'chameleon';
      if (bgMode === 'chameleon') {
        drawChameleonBackground(ctx, canvasW, canvasH, cx, cy, boxW, boxH, rotRad);
      } else if (bgMode === 'solid') {
        ctx.fillStyle = layer.bgColor || '#ffffff';
        ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);
      }

      // 글상자 영역 클리핑 후 멀티라인 텍스트 렌더링
      ctx.beginPath();
      ctx.rect(-boxW / 2, -boxH / 2, boxW, boxH);
      ctx.clip();

      const fontPx = Math.max(6, (layer.fontSize || 28) * refScale);
      const padPx = (layer.padding !== undefined ? layer.padding : 8) * refScale;
      const lsPx = (layer.letterSpacing !== undefined ? layer.letterSpacing : -1.5) * refScale;
      const lineH = fontPx * (layer.lineHeight || 1.35);
      const fontStyle = `${layer.italic ? 'italic ' : ''}${layer.bold ? 'bold ' : ''}${fontPx}px ${layer.fontFamily || "'Dotum', '돋움', sans-serif"}`;

      ctx.font = fontStyle;
      ctx.fillStyle = layer.color || '#1e293b';
      ctx.textBaseline = 'middle';

      const maxTextW = Math.max(10, boxW - padPx * 2);
      const rawParagraphs = String(layer.text !== undefined ? layer.text : '').split(/\r?\n/);
      const wrappedLines = [];

      for (const para of rawParagraphs) {
        if (!para) {
          wrappedLines.push('');
          continue;
        }
        let curLine = '';
        for (let i = 0; i < para.length; i++) {
          const ch = para[i];
          const testLine = curLine + ch;
          if (curLine.length > 0 && measureSpacedText(ctx, testLine, lsPx) > maxTextW) {
            wrappedLines.push(curLine);
            curLine = ch;
          } else {
            curLine = testLine;
          }
        }
        wrappedLines.push(curLine);
      }

      const totalTextH = wrappedLines.length * lineH;
      let startY = -totalTextH / 2 + lineH / 2;

      const align = layer.align || 'left';
      let textX = -boxW / 2 + padPx;
      if (align === 'center') textX = 0;
      else if (align === 'right') textX = boxW / 2 - padPx;

      for (let i = 0; i < wrappedLines.length; i++) {
        fillSpacedText(ctx, wrappedLines[i], textX, startY + i * lineH, align, lsPx);
      }

      ctx.restore();
    }

    // 도형 외곽 Path 생성 헬퍼
    function traceClosedOrSymbolShapePath(ctx, st, rx, ry, w, h, hw, inset, sw) {
      ctx.beginPath();
      if (st === 'rect') {
        ctx.rect(rx, ry, w, h);
      } else if (st === 'roundRect') {
        const rad = Math.min(w, h) * 0.22;
        ctx.moveTo(rx + rad, ry);
        ctx.arcTo(rx + w, ry, rx + w, ry + h, rad);
        ctx.arcTo(rx + w, ry + h, rx, ry + h, rad);
        ctx.arcTo(rx, ry + h, rx, ry, rad);
        ctx.arcTo(rx, ry, rx + w, ry, rad);
        ctx.closePath();
      } else if (st === 'ellipse' || st === 'noSymbol') {
        ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      } else if (st === 'triangle') {
        ctx.moveTo(0, ry);
        ctx.lineTo(rx + w, ry + h);
        ctx.lineTo(rx, ry + h);
        ctx.closePath();
      } else if (st === 'diamond') {
        ctx.moveTo(0, ry);
        ctx.lineTo(rx + w, 0);
        ctx.lineTo(0, ry + h);
        ctx.lineTo(rx, 0);
        ctx.closePath();
      } else if (st === 'pentagon') {
        for (let i = 0; i < 5; i++) {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          const px = Math.cos(ang) * (w / 2);
          const py = Math.sin(ang) * (h / 2);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else if (st === 'hexagon') {
        for (let i = 0; i < 6; i++) {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
          const px = Math.cos(ang) * (w / 2);
          const py = Math.sin(ang) * (h / 2);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else if (st === 'star') {
        for (let i = 0; i < 10; i++) {
          const ang = -Math.PI / 2 + (i * Math.PI) / 5;
          const rMul = (i % 2 === 0) ? 1.0 : 0.42;
          const px = Math.cos(ang) * (w / 2) * rMul;
          const py = Math.sin(ang) * (h / 2) * rMul;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else if (st === 'heart') {
        const topY = ry + h * 0.26;
        const botY = ry + h * 0.95;
        ctx.moveTo(0, topY);
        ctx.bezierCurveTo(0, ry + h * 0.02, rx, ry + h * 0.02, rx, ry + h * 0.36);
        ctx.bezierCurveTo(rx, ry + h * 0.64, 0, ry + h * 0.76, 0, botY);
        ctx.bezierCurveTo(0, ry + h * 0.76, rx + w, ry + h * 0.64, rx + w, ry + h * 0.36);
        ctx.bezierCurveTo(rx + w, ry + h * 0.02, 0, ry + h * 0.02, 0, topY);
        ctx.closePath();
      } else if (st === 'callout') {
        const bodyH = h * 0.76;
        const rad = Math.min(w, bodyH) * 0.16;
        const by = ry;
        ctx.moveTo(rx + rad, by);
        ctx.lineTo(rx + w - rad, by);
        ctx.quadraticCurveTo(rx + w, by, rx + w, by + rad);
        ctx.lineTo(rx + w, by + bodyH - rad);
        ctx.quadraticCurveTo(rx + w, by + bodyH, rx + w - rad, by + bodyH);
        ctx.lineTo(rx + w * 0.42, by + bodyH);
        ctx.lineTo(rx + w * 0.22, ry + h);
        ctx.lineTo(rx + w * 0.26, by + bodyH);
        ctx.lineTo(rx + rad, by + bodyH);
        ctx.quadraticCurveTo(rx, by + bodyH, rx, by + bodyH - rad);
        ctx.lineTo(rx, by + rad);
        ctx.quadraticCurveTo(rx, by, rx + rad, by);
        ctx.closePath();
      } else if (st === 'line') {
        ctx.moveTo(-hw + inset, 0);
        ctx.lineTo(hw - inset, 0);
      } else if (st === 'arrow' || st === 'doubleArrow') {
        const headLen = Math.min(w * 0.35, Math.max(sw * 3.2, Math.min(w, h) * 0.42));
        const headHalfH = Math.min(h / 2, headLen * 0.72);
        ctx.moveTo(-hw + inset, 0);
        ctx.lineTo(hw - inset, 0);
        ctx.moveTo(hw - inset - headLen, -headHalfH);
        ctx.lineTo(hw - inset, 0);
        ctx.lineTo(hw - inset - headLen, headHalfH);
        if (st === 'doubleArrow') {
          ctx.moveTo(-hw + inset + headLen, -headHalfH);
          ctx.lineTo(-hw + inset, 0);
          ctx.lineTo(-hw + inset + headLen, headHalfH);
        }
      } else if (st === 'check') {
        ctx.moveTo(rx + w * 0.12, ry + h * 0.52);
        ctx.lineTo(rx + w * 0.40, ry + h * 0.82);
        ctx.lineTo(rx + w * 0.88, ry + h * 0.18);
      } else if (st === 'cross') {
        ctx.moveTo(rx + w * 0.15, ry + h * 0.15);
        ctx.lineTo(rx + w * 0.85, ry + h * 0.85);
        ctx.moveTo(rx + w * 0.85, ry + h * 0.15);
        ctx.lineTo(rx + w * 0.15, ry + h * 0.85);
      }
    }

    // 15종 벡터 도형 렌더러 (면색 없음 투명 테두리 및 5종 선 스타일: 실선/이중선/파선/일점쇄선/점선 완벽 지원)
    function drawShapeLayerOnCanvas(ctx, layer, cx, cy, boxW, boxH, rotRad, refScale) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotRad);

      const hw = boxW / 2;
      const hh = boxH / 2;
      const sw = Math.max(0, (layer.strokeWidth !== undefined ? layer.strokeWidth : 4) * refScale);
      const inset = sw / 2;
      const w = Math.max(2, boxW - sw);
      const h = Math.max(2, boxH - sw);
      const rx = -w / 2;
      const ry = -h / 2;

      ctx.lineWidth = sw;
      ctx.strokeStyle = layer.strokeColor || '#dc2626';
      ctx.fillStyle = layer.fillColor || '#fef08a';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const dashType = layer.strokeDash || 'solid';
      if (dashType === 'dashed') {
        ctx.setLineDash([Math.max(6, sw * 2.4), Math.max(4, sw * 1.6)]);
      } else if (dashType === 'dashdot') {
        ctx.setLineDash([Math.max(8, sw * 2.8), Math.max(4, sw * 1.3), Math.max(2, sw * 0.7), Math.max(4, sw * 1.3)]);
      } else if (dashType === 'dotted') {
        ctx.setLineDash([Math.max(2, sw * 0.8), Math.max(4, sw * 1.8)]);
      } else {
        ctx.setLineDash([]);
      }

      const st = layer.shapeType || 'rect';
      const isLineLike = (st === 'line' || st === 'arrow' || st === 'doubleArrow' || st === 'check' || st === 'cross');

      traceClosedOrSymbolShapePath(ctx, st, rx, ry, w, h, hw, inset, sw);

      if (!isLineLike && !layer.fillTransparent) {
        ctx.fill();
      }

      if (sw > 0) {
        if (dashType === 'double') {
          // 이중선(═══) 렌더링
          const thinSw = Math.max(1, sw * 0.36);
          const gapOffset = Math.max(2.2, sw * 0.55);
          ctx.lineWidth = thinSw;

          if (st === 'line' || st === 'arrow' || st === 'doubleArrow') {
            const headLen = Math.min(w * 0.35, Math.max(sw * 3.2, Math.min(w, h) * 0.42));
            const headHalfH = Math.min(h / 2, headLen * 0.72);
            const xStart = (st === 'doubleArrow') ? (-hw + inset + headLen * 0.45) : (-hw + inset);
            const xEnd = (st === 'arrow' || st === 'doubleArrow') ? (hw - inset - headLen * 0.45) : (hw - inset);

            ctx.beginPath();
            ctx.moveTo(xStart, -gapOffset);
            ctx.lineTo(xEnd, -gapOffset);
            ctx.moveTo(xStart, gapOffset);
            ctx.lineTo(xEnd, gapOffset);

            if (st === 'arrow' || st === 'doubleArrow') {
              ctx.moveTo(hw - inset - headLen, -headHalfH);
              ctx.lineTo(hw - inset, 0);
              ctx.lineTo(hw - inset - headLen, headHalfH);
            }
            if (st === 'doubleArrow') {
              ctx.moveTo(-hw + inset + headLen, -headHalfH);
              ctx.lineTo(-hw + inset, 0);
              ctx.lineTo(-hw + inset + headLen, headHalfH);
            }
            ctx.stroke();
          } else if (st === 'check' || st === 'cross') {
            ctx.save();
            ctx.translate(0, -gapOffset * 0.75);
            traceClosedOrSymbolShapePath(ctx, st, rx, ry, w, h, hw, inset, sw);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.translate(0, gapOffset * 0.75);
            traceClosedOrSymbolShapePath(ctx, st, rx, ry, w, h, hw, inset, sw);
            ctx.stroke();
            ctx.restore();
          } else {
            // 닫힌 도형: 바깥선 + 안쪽 동심원/동심도형 이중선
            ctx.stroke();
            const innerGap = Math.max(3, sw * 1.15);
            if (w > innerGap * 2.5 && h > innerGap * 2.5) {
              ctx.save();
              ctx.scale((w - innerGap * 2) / w, (h - innerGap * 2) / h);
              traceClosedOrSymbolShapePath(ctx, st, rx, ry, w, h, hw, inset, sw);
              ctx.stroke();
              ctx.restore();
            }
          }
        } else {
          ctx.stroke();
        }

        // 금지 기호(🚫 noSymbol)의 내부 45° 대각선 추가 렌더링
        if (st === 'noSymbol') {
          const diagCos = Math.SQRT1_2;
          ctx.beginPath();
          if (dashType === 'double') {
            const thinSw = Math.max(1, sw * 0.36);
            const off = Math.max(1.8, sw * 0.45);
            ctx.lineWidth = thinSw;
            ctx.moveTo(-diagCos * (w / 2) + off, -diagCos * (h / 2) - off);
            ctx.lineTo(diagCos * (w / 2) + off, diagCos * (h / 2) - off);
            ctx.moveTo(-diagCos * (w / 2) - off, -diagCos * (h / 2) + off);
            ctx.lineTo(diagCos * (w / 2) - off, diagCos * (h / 2) + off);
          } else {
            ctx.moveTo(-diagCos * (w / 2), -diagCos * (h / 2));
            ctx.lineTo(diagCos * (w / 2), diagCos * (h / 2));
          }
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    function drawImageLayerOnCanvas(ctx, layer, cx, cy, boxW, boxH, rotRad, isMainViewer) {
      ctx.save();
      const b = layer.brightness !== undefined ? layer.brightness : 100;
      const c = layer.contrast !== undefined ? layer.contrast : 100;
      if (b !== 100 || c !== 100) {
        ctx.filter = `brightness(${b}%) contrast(${c}%)`;
      }
      ctx.translate(cx, cy);
      ctx.rotate(rotRad);

      const isCroppingThisLayer = Boolean(isMainViewer && typeof isCropActive !== 'undefined' && isCropActive && croppingLayerId === layer.id);
      const effSrc = getLayerEffectiveImageSource(layer, isCroppingThisLayer);

      if (!isCroppingThisLayer && layer.crop) {
        const dx = -boxW / 2 + boxW * (layer.crop.x || 0);
        const dy = -boxH / 2 + boxH * (layer.crop.y || 0);
        const dw = boxW * (layer.crop.w !== undefined ? layer.crop.w : 1);
        const dh = boxH * (layer.crop.h !== undefined ? layer.crop.h : 1);
        drawPerspectiveQuad(ctx, effSrc, dx, dy, dw, dh, layer.corners, layer.trapExp);
      } else {
        drawPerspectiveQuad(ctx, effSrc, -boxW / 2, -boxH / 2, boxW, boxH, layer.corners, layer.trapExp);
      }
      ctx.restore();
    }

    // --------------------------------------------------------------------------
    // 6. 2열 메인 뷰어 대화형 오버레이 (#layerStageOverlay) 렌더링 & 마우스/터치 조작
    // --------------------------------------------------------------------------

    function updateLayerStageOverlay() {
      const overlay = document.getElementById('layerStageOverlay');
      const canvas = document.getElementById('mainViewerCanvas');
      if (!overlay || !canvas) return;

      const layers = getCurrentItemLayers();
      const hideForModes = (typeof isCropActive !== 'undefined' && isCropActive) ||
                           (typeof isPerspectiveActive !== 'undefined' && isPerspectiveActive) ||
                           isEyedropperActive;

      if (layers.length === 0 || hideForModes || canvas.width === 0 || canvas.height === 0) {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        return;
      }

      const dispW = canvas.clientWidth || canvas.offsetWidth;
      const dispH = canvas.clientHeight || canvas.offsetHeight;
      if (!dispW || !dispH) {
        overlay.style.display = 'none';
        return;
      }

      overlay.style.display = 'block';
      overlay.innerHTML = '';

      const item = docState.items[docState.currentIndex];
      const cfg = getEffectiveItemSettings(docState.currentIndex);
      const paperRect = getActivePaperCanvasRect(canvas, item, cfg);
      const scaleX = dispW / canvas.width;
      const scaleY = dispH / canvas.height;

      layers.forEach((layer) => {
        const isSel = (selectedLayerId === layer.id);
        let cx = (paperRect.sx + layer.x * paperRect.subW) * scaleX;
        let cy = (paperRect.sy + layer.y * paperRect.subH) * scaleY;
        let bw = Math.max(18, layer.w * paperRect.subW * scaleX);
        let bh = Math.max(18, layer.h * paperRect.subH * scaleY);

        const boxEl = document.createElement('div');
        boxEl.className = 'layer-item-box' + (isSel ? ' selected' : '');
        boxEl.dataset.layerId = layer.id;
        boxEl.style.left = `${cx - bw / 2}px`;
        boxEl.style.top = `${cy - bh / 2}px`;
        boxEl.style.width = `${bw}px`;
        boxEl.style.height = `${bh}px`;
        boxEl.style.transform = `rotate(${layer.rot || 0}deg)`;
        boxEl.title = `${layer.name} (드래그: 이동${layer.type === 'text' ? ', 더블클릭: 텍스트 수정' : ''})`;

        if (isSel) {
          ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'].forEach(hKey => {
            const hEl = document.createElement('div');
            hEl.className = `layer-resize-handle ${hKey}`;
            hEl.dataset.handle = hKey;
            boxEl.appendChild(hEl);
          });

          const rotEl = document.createElement('div');
          rotEl.className = 'layer-rot-handle';
          rotEl.dataset.handle = 'rot';
          rotEl.title = '드래그하여 회전';
          rotEl.textContent = '⟳';
          boxEl.appendChild(rotEl);

          const delEl = document.createElement('button');
          delEl.type = 'button';
          delEl.className = 'layer-del-btn';
          delEl.title = '이 객체 삭제';
          delEl.textContent = '✕';
          delEl.onpointerdown = (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            deleteSelectedLayer();
          };
          boxEl.appendChild(delEl);
        }

        boxEl.addEventListener('dblclick', (ev) => {
          ev.stopPropagation();
          selectLayer(layer.id);
          if (layer.type === 'text') {
            const txtEl = document.getElementById('txtLayerContent');
            if (txtEl) {
              txtEl.focus();
              txtEl.select();
            }
          }
        });

        boxEl.addEventListener('pointerdown', (ev) => {
          if (ev.button !== 0 && ev.pointerType === 'mouse') return;
          if (isEyedropperActive) return;
          ev.stopPropagation();
          ev.preventDefault();

          if (selectedLayerId !== layer.id) {
            selectLayer(layer.id);
          }

          const handleEl = ev.target.closest('[data-handle]');
          const handleType = handleEl ? handleEl.dataset.handle : 'move';

          const canvasRect = canvas.getBoundingClientRect();
          const zoom = docState.zoom || 1.0;
          const pScreenW = paperRect.subW * scaleX * zoom;
          const pScreenH = paperRect.subH * scaleY * zoom;
          const centerScreenX = canvasRect.left + cx * zoom;
          const centerScreenY = canvasRect.top + cy * zoom;

          activeLayerDrag = {
            layerId: layer.id,
            handle: handleType,
            startX: ev.clientX,
            startY: ev.clientY,
            origX: layer.x,
            origY: layer.y,
            origW: layer.w,
            origH: layer.h,
            origRot: layer.rot || 0,
            origFontSize: layer.fontSize || 28,
            pScreenW: Math.max(20, pScreenW),
            pScreenH: Math.max(20, pScreenH),
            centerScreenX,
            centerScreenY
          };

          window.addEventListener('pointermove', onLayerPointerMove);
          window.addEventListener('pointerup', onLayerPointerUp);
          window.addEventListener('pointercancel', onLayerPointerUp);
        });

        overlay.appendChild(boxEl);
      });
    }

    function onLayerPointerMove(e) {
      if (!activeLayerDrag) return;
      const sel = getSelectedLayer();
      if (!sel || sel.id !== activeLayerDrag.layerId) return;

      const d = activeLayerDrag;
      if (d.handle === 'move') {
        const dxNorm = (e.clientX - d.startX) / d.pScreenW;
        const dyNorm = (e.clientY - d.startY) / d.pScreenH;
        sel.x = Math.max(-0.4, Math.min(1.4, d.origX + dxNorm));
        sel.y = Math.max(-0.4, Math.min(1.4, d.origY + dyNorm));
      } else if (d.handle === 'rot') {
        const ang = Math.atan2(e.clientY - d.centerScreenY, e.clientX - d.centerScreenX);
        let deg = Math.round((ang * 180) / Math.PI + 90);
        if (deg > 180) deg -= 360;
        if (deg <= -180) deg += 360;
        sel.rot = deg;
        syncLayerUI();
      } else {
        // 회전된 로컬 축 기준으로 마우스 변위 투영
        const rad = (-d.origRot * Math.PI) / 180;
        const rawDx = e.clientX - d.startX;
        const rawDy = e.clientY - d.startY;
        const localDx = (rawDx * Math.cos(rad) - rawDy * Math.sin(rad)) / d.pScreenW;
        const localDy = (rawDx * Math.sin(rad) + rawDy * Math.cos(rad)) / d.pScreenH;

        let newW = d.origW;
        let newH = d.origH;
        let shiftLocalX = 0;
        let shiftLocalY = 0;
        const minSize = 0.025;

        if (d.handle.includes('r')) {
          newW = Math.max(minSize, d.origW + localDx);
          shiftLocalX = (newW - d.origW) / 2;
        } else if (d.handle.includes('l')) {
          newW = Math.max(minSize, d.origW - localDx);
          shiftLocalX = -(newW - d.origW) / 2;
        }

        if (d.handle.includes('b')) {
          newH = Math.max(minSize, d.origH + localDy);
          shiftLocalY = (newH - d.origH) / 2;
        } else if (d.handle.includes('t')) {
          newH = Math.max(minSize, d.origH - localDy);
          shiftLocalY = -(newH - d.origH) / 2;
        }

        const posRad = (d.origRot * Math.PI) / 180;
        sel.w = newW;
        sel.h = newH;
        sel.x = d.origX + (shiftLocalX * Math.cos(posRad) - shiftLocalY * Math.sin(posRad));
        sel.y = d.origY + (shiftLocalX * Math.sin(posRad) + shiftLocalY * Math.cos(posRad));
      }

      const curIdx = docState.currentIndex;
      const canvas = document.getElementById('mainViewerCanvas');
      const item = docState.items[curIdx];
      const cfg = getEffectiveItemSettings(curIdx);
      if (canvas && item) {
        drawPaperWithImage(canvas, item, cfg, { isThumbnail: false });
      }
      updateLayerStageOverlay();
      if (typeof updateMiniPreview === 'function') updateMiniPreview();
    }

    async function onLayerPointerUp() {
      if (!activeLayerDrag) return;
      activeLayerDrag = null;
      window.removeEventListener('pointermove', onLayerPointerMove);
      window.removeEventListener('pointerup', onLayerPointerUp);
      window.removeEventListener('pointercancel', onLayerPointerUp);
      await refreshAllViewsForLayers();
    }

    // --------------------------------------------------------------------------
    // 7. 돋보기 스포이드 (Magnifying Eyedropper) 색상 추출기
    // --------------------------------------------------------------------------

    function startEyedropper(targetKey) {
      if (isEyedropperActive && activeEyedropperTarget === targetKey) {
        cancelEyedropper();
        return;
      }
      isEyedropperActive = true;
      activeEyedropperTarget = targetKey;
      document.body.classList.add('eyedropper-cursor');

      document.querySelectorAll('.btn-eyedropper').forEach(btn => btn.classList.remove('active'));
      const btnMap = {
        textColor: 'btnEyeTextColor',
        textBg: 'btnEyeTextBg',
        shapeFill: 'btnEyeShapeFill',
        shapeStroke: 'btnEyeShapeStroke'
      };
      const activeBtn = document.getElementById(btnMap[targetKey]);
      if (activeBtn) activeBtn.classList.add('active');

      updateLayerStageOverlay();
      updateStatusMsg('💧 스포이드 활성화: 문서 위에서 추출할 색상을 클릭하세요 (ESC: 취소)');
      if (typeof showExitToast === 'function') showExitToast('문서 위에서 추출할 글자/배경 색상을 클릭하세요.');
    }

    function cancelEyedropper() {
      isEyedropperActive = false;
      activeEyedropperTarget = null;
      document.body.classList.remove('eyedropper-cursor');
      document.querySelectorAll('.btn-eyedropper').forEach(btn => btn.classList.remove('active'));
      const vLoupe = document.getElementById('viewerPinLoupe');
      if (vLoupe) vLoupe.style.display = 'none';
      const mLoupe = document.getElementById('miniPinLoupe');
      if (mLoupe) mLoupe.style.display = 'none';
      updateLayerStageOverlay();
      updateStatusMsg('준비 완료');
    }

    function rgbToHex(r, g, b) {
      return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
    }

    function sampleCanvasColorAtClientPos(canvas, clientX, clientY) {
      if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
      const rect = canvas.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
      const px = Math.max(0, Math.min(canvas.width - 1, Math.floor(((clientX - rect.left) / rect.width) * canvas.width)));
      const py = Math.max(0, Math.min(canvas.height - 1, Math.floor(((clientY - rect.top) / rect.height) * canvas.height)));
      const data = canvas.getContext('2d').getImageData(px, py, 1, 1).data;
      return { hex: rgbToHex(data[0], data[1], data[2]), px, py, rect };
    }

    function updateEyedropperLoupe(canvas, clientX, clientY, isMini) {
      const sample = sampleCanvasColorAtClientPos(canvas, clientX, clientY);
      const loupe = document.getElementById(isMini ? 'miniPinLoupe' : 'viewerPinLoupe');
      const loupeCanvas = document.getElementById(isMini ? 'miniLoupeCanvas' : 'viewerLoupeCanvas');
      if (!sample || !loupe || !loupeCanvas) {
        if (loupe) loupe.style.display = 'none';
        return;
      }

      const loupeSize = isMini ? 100 : 110;
      const container = isMini ? document.getElementById('previewSheetStage') : document.getElementById('viewerViewport');
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      let lx = (clientX - cRect.left) - loupeSize / 2;
      let ly = (clientY - cRect.top) - loupeSize - 20;
      if (ly < 6) ly = (clientY - cRect.top) + 24;
      lx = Math.max(4, Math.min(cRect.width - loupeSize - 4, lx));

      loupe.style.left = `${lx + (container.scrollLeft || 0)}px`;
      loupe.style.top = `${ly + (container.scrollTop || 0)}px`;
      loupe.style.display = 'block';

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

      const cx = loupeSize / 2;
      const cy = loupeSize / 2;
      lctx.save();
      lctx.beginPath();
      lctx.arc(cx, cy, cx - 1, 0, Math.PI * 2);
      lctx.clip();

      lctx.fillStyle = '#ffffff';
      lctx.fillRect(0, 0, loupeSize, loupeSize);

      // 5배 초정밀 확대 렌더링 (픽셀 단위 식별)
      const srcSpan = 22;
      lctx.imageSmoothingEnabled = false;
      lctx.drawImage(
        canvas,
        sample.px - srcSpan / 2,
        sample.py - srcSpan / 2,
        srcSpan,
        srcSpan,
        0,
        0,
        loupeSize,
        loupeSize
      );

      if (typeof drawLoupeCrosshair === 'function') {
        drawLoupeCrosshair(lctx, cx, cy, 14);
      }

      // 하단 추출 색상 미리보기 캡슐
      lctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
      lctx.fillRect(cx - 32, loupeSize - 22, 64, 18);
      lctx.fillStyle = sample.hex;
      lctx.fillRect(cx - 28, loupeSize - 19, 12, 12);
      lctx.strokeStyle = '#ffffff';
      lctx.lineWidth = 1;
      lctx.strokeRect(cx - 28, loupeSize - 19, 12, 12);
      lctx.fillStyle = '#ffffff';
      lctx.font = 'bold 9.5px monospace';
      lctx.textAlign = 'left';
      lctx.textBaseline = 'middle';
      lctx.fillText(sample.hex.toUpperCase(), cx - 12, loupeSize - 13);

      lctx.restore();
    }

    async function applyEyedropperColor(hex) {
      const sel = getSelectedLayer();
      if (sel) {
        if (activeEyedropperTarget === 'textColor' && sel.type === 'text') {
          sel.color = hex;
        } else if (activeEyedropperTarget === 'textBg' && sel.type === 'text') {
          sel.bgColor = hex;
          sel.bgMode = 'solid';
        } else if (activeEyedropperTarget === 'shapeFill' && sel.type === 'shape') {
          sel.fillColor = hex;
          sel.fillTransparent = false;
        } else if (activeEyedropperTarget === 'shapeStroke' && sel.type === 'shape') {
          sel.strokeColor = hex;
        }
      }
      cancelEyedropper();
      syncLayerUI();
      await refreshAllViewsForLayers();
      if (typeof showExitToast === 'function') showExitToast(`색상 추출 완료: ${hex.toUpperCase()}`);
    }

    // 메인 뷰어 및 미니 프리뷰에서의 스포이드 이벤트 바인딩
    (function initEyedropperEvents() {
      window.addEventListener('pointermove', (e) => {
        if (!isEyedropperActive) return;
        const mainCanvas = document.getElementById('mainViewerCanvas');
        const miniCanvas = document.getElementById('miniCanvas');
        if (mainCanvas && mainCanvas.offsetWidth > 0) {
          const r = mainCanvas.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            updateEyedropperLoupe(mainCanvas, e.clientX, e.clientY, false);
            return;
          }
        }
        if (miniCanvas && miniCanvas.offsetWidth > 0) {
          const r = miniCanvas.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            updateEyedropperLoupe(miniCanvas, e.clientX, e.clientY, true);
            return;
          }
        }
      });

      window.addEventListener('pointerdown', (e) => {
        if (!isEyedropperActive) return;
        const mainCanvas = document.getElementById('mainViewerCanvas');
        const miniCanvas = document.getElementById('miniCanvas');
        let sample = sampleCanvasColorAtClientPos(mainCanvas, e.clientX, e.clientY);
        if (!sample) {
          sample = sampleCanvasColorAtClientPos(miniCanvas, e.clientX, e.clientY);
        }
        if (sample) {
          e.preventDefault();
          e.stopPropagation();
          applyEyedropperColor(sample.hex);
        }
      }, true);

      // 선택된 추가 객체를 Delete 키로 즉시 삭제 (입력창 포커스 중에는 제외)
      window.addEventListener('keydown', (e) => {
        if (e.key !== 'Delete' && e.key !== 'Del') return;
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) {
          return;
        }
        const sel = getSelectedLayer();
        if (sel) {
          e.preventDefault();
          deleteSelectedLayer();
        }
      });
    })();
