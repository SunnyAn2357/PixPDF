    function onGlobalPageSizeChange(val) {
      const grp = document.getElementById('groupGlobalCustomPx');
      if (grp) grp.style.display = val === 'custom' ? 'flex' : 'none';
    }

    function onGlobalFormatChange(val) {
      const grp = document.getElementById('grpGlobalTransparentBg');
      if (grp) grp.style.display = val === 'png' ? 'flex' : 'none';
    }

    // 삼선 햄버거 메뉴 ➡️ [기본 페이지 설정] 모달 제어 함수
    // 오른쪽 제어창의 5개 설정 항목과 100% 동일한 순서·명칭·옵션으로 연동
    function openGlobalSettingsModal() {
      menuDropdown.classList.remove('show');

      const g = docState.globalSettings;

      // 1. 용지 규격
      const selSize = document.getElementById('selGlobalPageSize');
      const pageSizeVal = g.pageSize || g.fit || 'original';
      if (selSize) selSize.value = pageSizeVal;
      onGlobalPageSizeChange(pageSizeVal);

      const txtW = document.getElementById('txtGlobalCustomWidth');
      const txtH = document.getElementById('txtGlobalCustomHeight');
      if (txtW) txtW.value = g.customW || 1920;
      if (txtH) txtH.value = g.customH || 1080;

      // 2. 용지 방향
      const selOrient = document.getElementById('selGlobalOrientation');
      if (selOrient) selOrient.value = g.orient || 'auto';

      // 3. 여백 설정
      const selMargin = document.getElementById('selGlobalMargin');
      if (selMargin) selMargin.value = String(g.margin !== undefined ? g.margin : 0);

      // 4. 해상도 / 화질
      const scaleVal = parseFloat(g.scale) || 3.0;
      const selScale = document.getElementById('selGlobalScale');
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

      // 5. 출력 포맷 (이미지 저장 시)
      const fmtVal = g.format || 'png';
      const selFmt = document.getElementById('selGlobalFormat');
      if (selFmt) selFmt.value = fmtVal;
      onGlobalFormatChange(fmtVal);

      const chkTrans = document.getElementById('chkGlobalTransparentBg');
      if (chkTrans) chkTrans.checked = g.transparentBg !== false;

      document.getElementById('modalGlobalSettings').classList.add('show');
      try { history.pushState({ appLayer: 'globalSettings' }, ''); } catch (e) {}
    }

    let isClosingLayerProgrammatically = false;

    function closeGlobalSettingsModal(syncHistory = true) {
      const modal = document.getElementById('modalGlobalSettings');
      if (modal && modal.classList.contains('show')) {
        modal.classList.remove('show');
        if (syncHistory && history.state && (history.state.appLayer === 'globalSettings' || history.state.modal === 'globalSettings')) {
          isClosingLayerProgrammatically = true;
          history.back();
          setTimeout(() => { isClosingLayerProgrammatically = false; }, 300);
        }
      }
    }

    function onModalBackdropClick(e) {
      if (e.target.id === 'modalGlobalSettings') {
        closeGlobalSettingsModal(true);
      }
    }

    // 기본 페이지 설정 적용: 일괄 적용 체크 시 열린 모든 페이지에 5대 설정 전면 반영
    async function applyGlobalSettingsModal() {
      const applyAll = document.getElementById('chkApplyToAllPages').checked;

      const pageSizeVal = document.getElementById('selGlobalPageSize').value;
      const customWVal = parseInt(document.getElementById('txtGlobalCustomWidth').value, 10) || 1920;
      const customHVal = parseInt(document.getElementById('txtGlobalCustomHeight').value, 10) || 1080;
      const orientVal = document.getElementById('selGlobalOrientation').value;
      const marginVal = parseInt(document.getElementById('selGlobalMargin').value, 10) || 0;
      const scaleVal = parseFloat(document.getElementById('selGlobalScale').value) || 3.0;
      const qualityVal = scaleVal >= 3.0 ? 'ultra' : (scaleVal >= 2.0 ? 'high' : 'standard');
      const formatVal = document.getElementById('selGlobalFormat').value;
      const chkTrans = document.getElementById('chkGlobalTransparentBg');
      const transparentVal = chkTrans ? chkTrans.checked : true;

      // docState.globalSettings에 최신 기본값 저장
      docState.globalSettings.pageSize = pageSizeVal;
      docState.globalSettings.fit = pageSizeVal;
      docState.globalSettings.customW = customWVal;
      docState.globalSettings.customH = customHVal;
      docState.globalSettings.orient = orientVal;
      docState.globalSettings.margin = marginVal;
      docState.globalSettings.scale = scaleVal;
      docState.globalSettings.quality = qualityVal;
      docState.globalSettings.format = formatVal;
      docState.globalSettings.transparentBg = transparentVal;

      if (applyAll && docState.items.length > 0) {
        for (let i = 0; i < docState.items.length; i++) {
          if (!docState.items[i].settings) {
            docState.items[i].settings = { ...docState.globalSettings, rotTarget: { ...docState.globalSettings.rotTarget } };
          } else {
            const s = docState.items[i].settings;
            s.pageSize = pageSizeVal;
            s.fit = pageSizeVal;
            s.customW = customWVal;
            s.customH = customHVal;
            s.orient = orientVal;
            s.margin = marginVal;
            s.scale = scaleVal;
            s.quality = qualityVal;
            s.format = formatVal;
            s.transparentBg = transparentVal;
          }
        }
        await renderThumbnailList();
        loadMainViewer(docState.currentIndex);
      } else {
        syncControlsForCurrentPage();
        const cur = docState.currentIndex;
        await renderMainViewerCanvas(cur);
        updateThumbnailCanvas(cur);
        updateMiniPreview();
      }

      closeGlobalSettingsModal();
      syncControlsForCurrentPage();
      updateMiniPreview();
    }

    // 햄버거 메뉴 토글
    const btnHamburger = document.getElementById('btnHamburger');
    const menuDropdown = document.getElementById('menuDropdown');

    function closeMenuDropdown() {
      if (menuDropdown && menuDropdown.classList.contains('show')) {
        menuDropdown.classList.remove('show');
      }
    }

    btnHamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFileMgrDropdown();
      menuDropdown.classList.toggle('show');
    });

    // [+ 삽입] 드롭다운 메뉴 제어
    function toggleFileMgrDropdown(e) {
      if (e) e.stopPropagation();
      closeMenuDropdown();
      const menu = document.getElementById('menuFileMgrDropdown') || document.getElementById('menuInsertDropdown');
      if (menu) menu.classList.toggle('show');
    }
    const toggleInsertDropdown = toggleFileMgrDropdown;

    function closeFileMgrDropdown() {
      const menu = document.getElementById('menuFileMgrDropdown') || document.getElementById('menuInsertDropdown');
      if (menu) menu.classList.remove('show');
    }
    const closeInsertDropdown = closeFileMgrDropdown;

    function openOpenFilesManagerModal(e) {
      if (e) e.stopPropagation();
      closeFileMgrDropdown();
      renderOpenFilesList();
      const modal = document.getElementById('modalOpenFilesManager');
      if (modal) {
        modal.classList.add('show');
        try { history.pushState({ appLayer: 'openFilesManager' }, ''); } catch (err) {}
      }
    }

    function closeOpenFilesManagerModal(syncHistory = true) {
      const modal = document.getElementById('modalOpenFilesManager');
      if (modal && modal.classList.contains('show')) {
        modal.classList.remove('show');
        if (syncHistory && history.state && (history.state.appLayer === 'openFilesManager' || history.state.modal === 'openFilesManager')) {
          isClosingLayerProgrammatically = true;
          history.back();
          setTimeout(() => { isClosingLayerProgrammatically = false; }, 300);
        }
      }
    }

    function onOpenFilesManagerBackdropClick(e) {
      if (e.target.id === 'modalOpenFilesManager') {
        closeOpenFilesManagerModal(true);
      }
    }

    function renderOpenFilesList() {
      const container = document.getElementById('openFilesListContainer');
      const badge = document.getElementById('openFilesCountBadge');
      if (!container) return;

      if (!docState.openedFiles) docState.openedFiles = [];

      const activeFiles = docState.openedFiles.filter(f => {
        return docState.items.some(it => it.fileId === f.fileId);
      });

      if (badge) badge.textContent = `${activeFiles.length}개 파일`;

      if (activeFiles.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 40px 10px; color: var(--text-muted); font-size: 13px;">
            <div style="font-size: 28px; margin-bottom: 8px;">📂</div>
            현재 열려 있는 파일이 없습니다.
          </div>
        `;
        return;
      }

      let html = '';
      activeFiles.forEach((f, idx) => {
        const fileItems = docState.items.filter(it => it.fileId === f.fileId);
        const currentPages = fileItems.map(it => it.pageNum).filter(Boolean);
        const pageRangeStr = formatPageRanges(currentPages);

        let detailText = '';
        if (f.type === 'pdf') {
          detailText = `총 ${f.totalDocPages}p 중 <strong>${fileItems.length}페이지</strong> 열림 (p.${pageRangeStr})`;
        } else if (f.type === 'image') {
          detailText = `이미지 파일 (1페이지 열림)`;
        } else {
          detailText = `빈 페이지 (${fileItems.length}개 열림)`;
        }

        const isPdf = f.type === 'pdf';

        html += `
          <div class="file-mgr-card">
            <div class="file-mgr-info">
              <div class="file-mgr-title-row">
                <span style="font-size: 12px; font-weight: 700; color: var(--text-muted); width: 22px;">#${idx + 1}</span>
                <span class="file-mgr-badge ${f.type}">${f.type}</span>
                <span class="file-mgr-name" title="${f.name}">${f.name}</span>
              </div>
              <div class="file-mgr-detail">${detailText}</div>
            </div>
            <div class="file-mgr-actions">
              <button type="button" class="btn-tool btn-mgr-resync" 
                ${!isPdf ? 'disabled style="opacity:0.35; cursor:not-allowed;" title="이미지는 단일 페이지이므로 재선택을 지원하지 않습니다"' : `title="페이지 번호 재선택" onclick="reselectPdfPages('${f.fileId}')"`}>
                📑 페이지 재선택
              </button>
              <button type="button" class="btn-tool btn-mgr-delete" title="이 파일의 모든 페이지 제외" onclick="removeFileEntirely('${f.fileId}')">
                🗑️ 파일 제외
              </button>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    }

    async function removeFileEntirely(fileId) {
      const fileRecord = docState.openedFiles.find(f => f.fileId === fileId);
      const fileName = fileRecord ? fileRecord.name : '해당 파일';
      const count = docState.items.filter(it => it.fileId === fileId).length;

      const newItems = [];
      const newChecks = [];
      for (let i = 0; i < docState.items.length; i++) {
        if (docState.items[i].fileId !== fileId) {
          newItems.push(docState.items[i]);
          newChecks.push(docState.checkList[i]);
        }
      }

      docState.items = newItems;
      docState.checkList = newChecks;
      docState.currentIndex = Math.max(0, Math.min(docState.currentIndex, docState.items.length - 1));

      await renderThumbnailList();
      if (docState.items.length > 0) {
        await loadMainViewer(docState.currentIndex);
        renderOpenFilesList();
      } else {
        closeOpenFilesManagerModal(true);
        refreshWorkspaceDisplay();
      }
      updateStatusMsg(`[${fileName}] ${count}개 페이지가 제외되었습니다.`);
    }

    function reselectPdfPages(fileId) {
      const fileRecord = docState.openedFiles.find(f => f.fileId === fileId);
      if (!fileRecord || !fileRecord.doc) {
        alert('해당 PDF 문서 데이터를 찾을 수 없습니다.');
        return;
      }
      closeOpenFilesManagerModal(false);

      const currentPages = docState.items
        .filter(it => it.fileId === fileId)
        .map(it => it.pageNum)
        .filter(Boolean);

      openPdfPicker(fileRecord.doc, fileRecord.file, -1, 'resync', fileId, currentPages);
    }

    function triggerInsertFileAction(e) {
      if (e) e.stopPropagation();
      closeInsertDropdown();
      const total = docState.items.length;
      const curIdx = docState.currentIndex;
      const insertAt = (total > 0 && curIdx >= 0 && curIdx < total) ? curIdx + 1 : -1;
      triggerInsertFileDialog(insertAt);
    }

    async function insertBlankPageAction(e) {
      if (e) e.stopPropagation();
      closeInsertDropdown();

      const total = docState.items.length;
      const curIdx = docState.currentIndex;
      const insertAt = (total > 0 && curIdx >= 0 && curIdx < total) ? curIdx + 1 : total;

      const cfg = getEffectiveItemSettings(curIdx >= 0 ? curIdx : 0);
      const sizeKey = cfg.pageSize || cfg.fit || 'original';
      const orientOpt = cfg.orient || 'auto';
      const isLandscape = orientOpt === 'l';

      // 참조 크기 (original일 경우 현재 선택된 이미지 크기, 없으면 1200x1600)
      let refW = 1200, refH = 1600;
      if (total > 0 && curIdx >= 0 && docState.items[curIdx]) {
        refW = docState.items[curIdx].width || 1200;
        refH = docState.items[curIdx].height || 1600;
      }

      const paper = resolvePaperGeometry(sizeKey, isLandscape, refW, refH, cfg.customW, cfg.customH);
      const canvasW = Math.max(200, Math.min(2400, Math.round(paper.widthPx || 1200)));
      const canvasH = Math.max(200, Math.min(2400, Math.round(paper.heightPx || (canvasW / (paper.ratio || 1)))));

      // 순백색 캔버스 생성
      const blankCanvas = document.createElement('canvas');
      blankCanvas.width = canvasW;
      blankCanvas.height = canvasH;
      const bctx = blankCanvas.getContext('2d');
      bctx.fillStyle = '#ffffff';
      bctx.fillRect(0, 0, canvasW, canvasH);

      const dataUrl = blankCanvas.toDataURL('image/png');
      const imgObj = new Image();
      imgObj.src = dataUrl;
      await new Promise(r => { imgObj.onload = r; });

      const newItemSettings = {
        pageSize: sizeKey,
        fit: sizeKey,
        quality: 'ultra',
        rot: 0,
        rotTarget: { page: true, image: true },
        contentScale: 1.0,
        scaleX: 1.0,
        trapezoid: 0,
        brightness: 100,
        contrast: 100,
        offsetX: 0,
        offsetY: 0,
        orient: orientOpt,
        margin: cfg.margin || 0,
        format: cfg.format || 'png',
        transparentBg: false,
        customW: cfg.customW,
        customH: cfg.customH
      };

      const blankFileId = registerOpenedFile(null, 'blank', null, 1);
      const newPageItem = {
        type: 'image',
        fileId: blankFileId,
        name: `빈페이지_${insertAt + 1}.png`,
        imgObj: imgObj,
        width: canvasW,
        height: canvasH,
        settings: newItemSettings
      };

      docState.items.splice(insertAt, 0, newPageItem);
      docState.checkList.splice(insertAt, 0, true);
      docState.currentIndex = insertAt;

      await refreshWorkspaceDisplay();
      await loadMainViewer(insertAt);
      updateStatusMsg(`#${insertAt + 1} 위치에 빈 페이지가 삽입되었습니다.`);
    }

    window.addEventListener('click', () => {
      closeMenuDropdown();
      closeInsertDropdown();
    });

    function triggerOpenFileDialog() {
      const fileInput = document.getElementById('fileInput');
      if (fileInput) {
        fileInput.accept = 'application/pdf,image/*';
        fileInput.multiple = true;
        fileInput.value = '';
        fileInput.click();
      }
      closeMenuDropdown();
    }

    async function triggerPrint() {
      closeMenuDropdown();

      // 선택된 페이지/이미지 인덱스 추출 (유효한 아이템만 엄격 필터링)
      const selectedIndices = [];
      if (docState.items.length === 0) {
        alert('인쇄할 문서 또는 이미지가 없습니다.');
        return;
      }
      docState.checkList.forEach((chk, i) => { if (chk && docState.items[i]) selectedIndices.push(i); });

      if (selectedIndices.length === 0) {
        alert('인쇄할 페이지(항목)를 1개 이상 선택해 주세요.');
        return;
      }

      const printContainer = document.getElementById('printContainer');
      printContainer.innerHTML = '';
      let printStyleEl = document.getElementById('printPageStyles');
      if (!printStyleEl) {
        printStyleEl = document.createElement('style');
        printStyleEl.id = 'printPageStyles';
        document.head.appendChild(printStyleEl);
      }
      printStyleEl.textContent = '';
      let printPageSeq = 0;
      updateStatusMsg(`인쇄 데이터 준비 중 (${selectedIndices.length}페이지)...`);

      try {
        for (let step = 0; step < selectedIndices.length; step++) {
          const pageIndex = selectedIndices[step];
          const p = docState.items[pageIndex];
          if (!p) continue;
          const cfg = getEffectiveItemSettings(pageIndex);
          const cScale = cfg.contentScale || 1.0;
          const { rotImg, isPageRot90, isImgRot90 } = getResolvedRotations(cfg);

          const tempCanvas = document.createElement('canvas');
          let origW = 0, origH = 0;
          let baseScaleW = 0, baseScaleH = 0;

          if (p.type === 'pdf') {
            const page = await p.doc.getPage(p.pageNum);
            const vp = await renderPdfPageToCanvas(page, 3.0, rotImg, tempCanvas);

            const origVp = page.getViewport({ scale: 1.0, rotation: 0 });
            origW = origVp.width;
            origH = origVp.height;
            baseScaleW = vp.width;
            baseScaleH = vp.height;
          } else {
            const rotRad = (rotImg * Math.PI) / 180;
            const srcRotW = isImgRot90 ? p.height : p.width;
            const srcRotH = isImgRot90 ? p.width : p.height;
            tempCanvas.width = srcRotW;
            tempCanvas.height = srcRotH;
            const tctx = tempCanvas.getContext('2d');
            tctx.fillStyle = '#ffffff';
            tctx.fillRect(0, 0, srcRotW, srcRotH);
            tctx.translate(srcRotW / 2, srcRotH / 2);
            tctx.rotate(rotRad);
            tctx.drawImage(p.imgObj, -p.width / 2, -p.height / 2);

            origW = p.width;
            origH = p.height;
            baseScaleW = srcRotW;
            baseScaleH = srcRotH;
          }

          const imgF = (p.type === 'pdf') ? 1 : getImagePageFactor(origW, origH);
          const baseOrigW = isPageRot90 ? origH : origW;
          const baseOrigH = isPageRot90 ? origW : origH;
          const scaleMul = (p.type === 'pdf') ? 3.0 : imgF;
          const refW = baseOrigW * scaleMul, refH = baseOrigH * scaleMul;
          const isOrigLandscape = origW > origH;
          const orientOpt = cfg.orient || 'auto';
          const baseLandscape = orientOpt === 'l' || (orientOpt === 'auto' && isOrigLandscape);
          const isLandscape = isPageRot90 ? !baseLandscape : baseLandscape;
          const paper = resolvePaperGeometry(cfg.fit || cfg.pageSize || 'original', isLandscape, refW, refH, cfg.customW, cfg.customH);

          let paperW, paperH;
          if (cfg.fit === 'original' || cfg.pageSize === 'original') {
            paperW = baseOrigW * scaleMul;
            paperH = baseOrigH * scaleMul;
          } else if (cfg.fit === 'custom' || cfg.pageSize === 'custom') {
            paperW = paper.widthPx;
            paperH = paper.heightPx;
          } else {
            if (paper.isLandscape) {
              paperW = Math.max(refW, Math.round(refH * paper.ratio));
              paperH = Math.round(paperW / paper.ratio);
            } else {
              paperH = Math.max(refH, Math.round(refW / paper.ratio));
              paperW = Math.round(paperH * paper.ratio);
            }
          }

          let finalCanvas = document.createElement('canvas');
          let fctx = finalCanvas.getContext('2d');
          finalCanvas.width = paperW;
          finalCanvas.height = paperH;
          fctx.fillStyle = '#ffffff';
          fctx.fillRect(0, 0, paperW, paperH);

          const scaleX = cfg.scaleX !== undefined ? cfg.scaleX : 1.0;
          const brightness = cfg.brightness !== undefined ? cfg.brightness : 100;
          const contrast = cfg.contrast !== undefined ? cfg.contrast : 100;
          const offsetX = cfg.offsetX !== undefined ? cfg.offsetX : 0;
          const offsetY = cfg.offsetY !== undefined ? cfg.offsetY : 0;

          const baseScale = Math.min(paperW / baseScaleW, paperH / baseScaleH);
          const drawW = baseScaleW * baseScale * cScale * scaleX;
          const drawH = baseScaleH * baseScale * cScale;
          const shiftX = paperW * (offsetX / 100);
          const shiftY = paperH * (offsetY / 100);
          const posX = (paperW - drawW) / 2 + shiftX;
          const posY = (paperH - drawH) / 2 + shiftY;

          fctx.save();
          fctx.beginPath();
          fctx.rect(0, 0, paperW, paperH);
          fctx.clip();
          if (brightness !== 100 || contrast !== 100) {
            fctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
          }
          drawPerspectiveQuad(fctx, tempCanvas, posX, posY, drawW, drawH, cfg.corners, cfg.trapExp || cfg.trapezoid);
          fctx.restore();
          tempCanvas.width = 0; tempCanvas.height = 0;

          const pageItem = document.createElement('div');
          pageItem.className = 'print-page-item';
          {
            // 페이지별 고정 mm 용지 크기 지정 (vh 단위 오차로 인한 빈 페이지/축소 방지)
            const pgLong = 297;
            const cw = finalCanvas.width, ch = finalCanvas.height;
            const pgW = cw >= ch ? pgLong : Math.round(pgLong * cw / ch * 100) / 100;
            const pgH = cw >= ch ? Math.round(pgLong * ch / cw * 100) / 100 : pgLong;
            const pgName = 'pg' + printPageSeq++;
            printStyleEl.textContent += '@page ' + pgName + ' { size: ' + pgW + 'mm ' + pgH + 'mm; margin: 0; }\n';
            pageItem.style.page = pgName;
            pageItem.style.width = pgW + 'mm';
            pageItem.style.height = pgH + 'mm';
            pageItem.style.overflow = 'hidden';

            // 크로미움 브라우저 인쇄 엔진 무결성을 위한 래스터 이미지(img) 변환 삽입
            const printImg = document.createElement('img');
            printImg.className = 'print-page-image';
            printImg.src = finalCanvas.toDataURL('image/png');
            printImg.style.width = '100%';
            printImg.style.height = '100%';
            printImg.style.objectFit = 'contain';
            printImg.style.display = 'block';

            await new Promise((res) => {
              if (printImg.complete) res();
              else {
                printImg.onload = res;
                printImg.onerror = res;
              }
            });

            pageItem.appendChild(printImg);
          }
          finalCanvas.width = 0; finalCanvas.height = 0;
          printContainer.appendChild(pageItem);
        }

        updateStatusMsg('인쇄 대화상자 호출 중...');
        await new Promise(r => setTimeout(r, 200)); // DOM 렌더링 및 이미지 정착 완료 대기

        const cleanupPrint = () => {
          printContainer.innerHTML = '';
          printStyleEl.textContent = '';
          updateStatusMsg('준비 완료');
        };
        // 인쇄창이 닫히는 순간(인쇄 또는 취소 클릭) 정확히 메모리 해제
        window.addEventListener('afterprint', cleanupPrint, { once: true });
        // afterprint 이벤트 미지원 구형 브라우저 대비 충분히 긴(1분) 안전 백업 타임아웃
        setTimeout(cleanupPrint, 60000);

        window.print();

      } catch (err) {
        console.error(err);
        alert(`인쇄 처리 중 오류: ${err.message}`);
        printContainer.innerHTML = '';
        updateStatusMsg('인쇄 오류 발생');
      }
    }

    // 문서 닫기 (현재 열린 모든 이미지 및 PDF 닫기)
    function triggerCloseDocument() {
      closeMenuDropdown();
      docState.items = [];
      docState.checkList = [];
      docState.currentIndex = 0;
      docState.doc = null;
      refreshWorkspaceDisplay();
      updateStatusMsg('문서를 닫았습니다.');
    }

    // 활성 작업 존재 여부 확인 (이탈/새로고침 방어용)
    function hasActiveWork() {
      return Array.isArray(docState.items) && docState.items.length > 0;
    }

    // 사용자 제스처 히스토리 무장 플래그 (Chromium History Manipulation Intervention 방어)
    let hasUserArmedHistory = false;

    // 히스토리 앵커 초기화 (뒤로가기 가로채기 기준점)
    function initHistoryAnchor() {
      try {
        if (!history.state || (!history.state.pixpdfBase && !history.state.pixpdfRoot)) {
          history.replaceState({ pixpdfBase: true }, '');
          history.pushState({ pixpdfRoot: true }, '');
        }
      } catch (e) {}
    }

    // 모바일 브라우저 사용자 제스처 히스토리 등록 (터치/클릭 발생 시 브라우저가 인정하는 정당한 이동 앵커 수립)
    function armUserGestureHistory() {
      if (hasUserArmedHistory) return;
      hasUserArmedHistory = true;
      try {
        history.pushState({ pixpdfRoot: true, userArmed: true }, '');
      } catch (e) {}
    }

    // 모바일 설정 패널 토글 (히스토리 동기화 지원)
    function toggleMobileControl(show, syncHistory = true) {
      if (window.innerWidth > 860) return;
      const col = document.getElementById('colControl');
      if (!col) return;
      if (show) {
        if (!col.classList.contains('mobile-open')) {
          col.classList.add('mobile-open');
          try {
            history.pushState({ appLayer: 'mobileControl' }, '');
          } catch (e) {}
        }
      } else {
        if (col.classList.contains('mobile-open')) {
          col.classList.remove('mobile-open');
          if (syncHistory && history.state && history.state.appLayer === 'mobileControl') {
            isClosingLayerProgrammatically = true;
            history.back();
            setTimeout(() => { isClosingLayerProgrammatically = false; }, 300);
          }
        }
      }
    }

    // 앱 종료 및 더블 탭 안내 토스트 제어
    let isAppExiting = false;
    let toastHideTimer = null;

    // 현재 종료 안내 토스트가 화면에 노출 중인지 여부 확인 (토스트가 뜬 동안에만 뒤로가기 시 종료)
    function isExitToastVisible() {
      const toast = document.getElementById('appToast');
      return !!(toast && toast.classList.contains('show'));
    }

    // 단정하고 심플한 단일 문구 토스트 표출
    function showExitToast(actionText = "'뒤로' 버튼을 한 번 더 누르면 종료됩니다") {
      const toast = document.getElementById('appToast');
      if (!toast) return;

      toast.classList.remove('show');
      toast.innerHTML = `
        <div class="toast-icon-wrap" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </div>
        <span class="toast-text">${actionText}</span>
      `;

      // 강제 레이아웃 리플로우로 애니메이션 리셋
      void toast.offsetWidth;

      toast.onclick = () => {
        toast.classList.remove('show');
        if (toastHideTimer) clearTimeout(toastHideTimer);
      };

      toast.classList.add('show');
      if (toastHideTimer) clearTimeout(toastHideTimer);
      // 토스트가 화면에 떠 있는 동안(2.5초)에만 뒤로가기 시 종료, 시간이 지나 사라지면 다시 1회차 상태로 안전 복귀
      toastHideTimer = setTimeout(() => {
        toast.classList.remove('show');
      }, 2500);
    }

    function exitApp() {
      isAppExiting = true;
      const toast = document.getElementById('appToast');
      if (toast) toast.classList.remove('show');

      // 1. 브라우저 탭 / PWA 창 닫기 시도
      try {
        window.close();
      } catch (e) {}

      // 2. 브라우저 히스토리 이전 방문 사이트로 이동 (가로채기 해제 후 자연스러운 앱 퇴출)
      try {
        history.back();
      } catch (e) {}
    }

    // 1열 리사이저 (너비 조절)
    const colThumb = document.getElementById('colThumb');
    const colResizer = document.getElementById('colResizer');
    let isResizing = false;

    colResizer.addEventListener('mousedown', () => {
      isResizing = true;
      colResizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
    });
    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      if (e.clientX >= 240 && e.clientX <= 500) {
        colThumb.style.width = `${e.clientX}px`;
      }
    });
    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        colResizer.classList.remove('resizing');
        document.body.style.cursor = 'default';
      }
    });

    // 커스텀 바이너리 인코더
    const CustomEncoders = {
      canvasToBMP(ctx, w, h) {
        const imgData = ctx.getImageData(0, 0, w, h).data;
        const rowSize = Math.floor((24 * w + 31) / 32) * 4;
        const pixelArraySize = rowSize * h;
        const buffer = new ArrayBuffer(54 + pixelArraySize);
        const view = new DataView(buffer);

        view.setUint16(0, 0x424D, false); // 'B', 'M'
        view.setUint32(2, 54 + pixelArraySize, true);
        view.setUint32(10, 54, true);

        view.setUint32(14, 40, true);
        view.setInt32(18, w, true);
        view.setInt32(22, h, true);
        view.setUint16(26, 1, true);
        view.setUint16(28, 24, true);
        view.setUint32(34, pixelArraySize, true);

        let offset = 54;
        for (let y = h - 1; y >= 0; y--) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            view.setUint8(offset++, imgData[idx + 2]);
            view.setUint8(offset++, imgData[idx + 1]);
            view.setUint8(offset++, imgData[idx]);
          }
          while ((offset - 54) % 4 !== 0) view.setUint8(offset++, 0);
        }
        return new Blob([buffer], { type: 'image/bmp' });
      },

      async canvasToICO(canvas) {
        const size = Math.min(256, Math.max(canvas.width, canvas.height));
        const icoCanvas = document.createElement('canvas');
        icoCanvas.width = size;
        icoCanvas.height = size;
        const ictx = icoCanvas.getContext('2d');
        ictx.drawImage(canvas, 0, 0, size, size);

        const pngBlob = await new Promise(r => icoCanvas.toBlob(r, 'image/png'));
        const pngBuf = await pngBlob.arrayBuffer();

        const totalSize = 22 + pngBuf.byteLength;
        const icoBuffer = new ArrayBuffer(totalSize);
        const view = new DataView(icoBuffer);

        view.setUint16(0, 0, true);
        view.setUint16(2, 1, true);
        view.setUint16(4, 1, true);

        view.setUint8(6, size >= 256 ? 0 : size);
        view.setUint8(7, size >= 256 ? 0 : size);
        view.setUint8(8, 0);
        view.setUint8(9, 0);
        view.setUint16(10, 1, true);
        view.setUint16(12, 32, true);
        view.setUint32(14, pngBuf.byteLength, true);
        view.setUint32(18, 22, true);

        new Uint8Array(icoBuffer, 22).set(new Uint8Array(pngBuf));
        return new Blob([icoBuffer], { type: 'image/x-icon' });
      },

      canvasToTIFF(ctx, w, h) {
        const imgData = ctx.getImageData(0, 0, w, h).data;
        const tiffBytes = UTIF.encodeImage(imgData.buffer, w, h);
        return new Blob([tiffBytes], { type: 'image/tiff' });
      }
    };

    // 단일 통합 모드 호환용 함수
    function setAppMode(mode) {
      appMode = mode;
      const tab1 = document.getElementById('tabPdf2Img');
      if (tab1) tab1.classList.toggle('active', mode === 'pdf2img');
      const tab2 = document.getElementById('tabImg2Pdf');
      if (tab2) tab2.classList.toggle('active', mode === 'img2pdf');
      refreshWorkspaceDisplay();
      syncControlsForCurrentPage();
    }

    // 현재 활성화된 워크스페이스 화면 갱신 (단일 통합 모드)
    async function refreshWorkspaceDisplay() {
      const viewerWrap = document.getElementById('viewerWrap');
      const emptyMsg = document.getElementById('viewerEmptyMsg');
      const btnAction = document.getElementById('btnAction');
      const mvc = document.getElementById('mainViewerCanvas');
      const mc = document.getElementById('miniCanvas');
      const ms = document.getElementById('miniSheet');
      const me = document.getElementById('miniEmpty');
      const mi = document.getElementById('miniInfo');

      const btnSavePdf = document.getElementById('btnSavePdf');
      const btnSaveImg = document.getElementById('btnSaveImg');

      if (docState.items.length > 0) {
        emptyMsg.style.display = 'none';
        viewerWrap.style.display = 'block';
        if (ms) ms.style.display = 'block';
        if (me) me.style.display = 'none';
        await renderThumbnailList();
        await loadMainViewer(docState.currentIndex || 0);
        updateThumbCounts();
        updateStatusMsg(`${docState.items.length}개 항목 대기 중`);
      } else {
        const emptyGuide = `
          <div class="thumb-empty-guide" style="padding: 32px 14px; text-align: center; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div style="width: 46px; height: 46px; border-radius: 12px; background: #e2e8f0; display: flex; align-items: center; justify-content: center; color: #64748b; margin-bottom: 10px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
            </div>
            <div style="font-size: 14px; font-weight: 700; color: var(--text-sub); margin-bottom: 4px; white-space: nowrap;">PDF 또는 이미지를 불러오세요.</div>
            <p style="font-size: 11.5px; line-height: 1.5; color: var(--text-muted); margin-bottom: 14px;">PDF와 이미지를 자유롭게 섞어서 편집, 재구성, 저장합니다.</p>
            <button class="btn-tool" style="background: var(--primary); color: #fff; border-color: var(--primary); padding: 8px 18px; font-size: 13px; font-weight: 700; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px;" onclick="triggerOpenFileDialog()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg><span>파일 열기</span></button>
          </div>
        `;
        document.getElementById('thumbList').innerHTML = emptyGuide;
        document.getElementById('thumbCount').textContent = '0 항목';
        document.getElementById('viewerPageIndicator').textContent = '- / -';
        const mpi = document.getElementById('mobilePageIndicator');
        if (mpi) mpi.textContent = '- / -';
        viewerWrap.style.display = 'none';
        emptyMsg.style.display = 'flex';
        if (mvc) { mvc.width = 0; mvc.height = 0; }
        if (mc) { mc.width = 0; mc.height = 0; }
        if (ms) { ms.style.display = 'none'; ms.style.width = '0px'; ms.style.height = '0px'; }
        if (me) me.style.display = 'flex';
        if (mi) { mi.textContent = '선택 항목 기준 윤곽'; }
        if (btnAction) btnAction.disabled = true;
        if (btnSavePdf) btnSavePdf.disabled = true;
        if (btnSaveImg) btnSaveImg.disabled = true;
        updateThumbCounts();
        updateStatusMsg('준비 완료');
        syncControlsForCurrentPage();
      }
    }

    // 파일 인풋 이벤트
    const mainFileInput = document.getElementById('fileInput');
    if (mainFileInput) {
      mainFileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        try {
          await processFiles(files, -1, 'auto');
        } finally {
          e.target.value = '';
        }
      });
    }

    const insertFileInput = document.getElementById('insertFileInput');
    if (insertFileInput) {
      insertFileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        try {
          await processFiles(files, pendingInsertIndex, 'insert-button');
        } finally {
          e.target.value = '';
        }
      });
    }

    function triggerInsertFileDialog(targetIndex = -1) {
      pendingInsertIndex = targetIndex;
      const input = document.getElementById('insertFileInput');
      if (input) {
        input.accept = 'application/pdf,image/*';
        input.multiple = true;
        input.value = '';
        input.click();
      }
    }

    // -------------------------------------------------------------
    // [핵심] 전역 스마트 드래그 앤 드롭 라우터 (거슬리는 초록 오버레이 제거)
    // -------------------------------------------------------------
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

      const files = Array.from(e.dataTransfer.files);
      
      // 드롭된 위치 파악
      const colThumbElem = document.getElementById('colThumb');
      const isOverThumb = colThumbElem.contains(e.target);

      if (isOverThumb) {
        // 1열 썸네일 영역에 떨어진 경우 (위치 정밀 삽입)
        await processFiles(files, -1, 'thumb-area');
      } else {
        // 가운데 창이나 오른쪽 창 등 화면 어디든 떨어진 경우
        await processFiles(files, -1, 'center-area');
      }
    });

    // PDF.js 라이브러리 비동기 초기화 보장 헬퍼 (초기 로딩 지연 방어)
    async function ensurePdfJsReady() {
      if (window.pdfjsLib) return window.pdfjsLib;
      for (let i = 0; i < 35; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (window.pdfjsLib) return window.pdfjsLib;
      }
      return window.pdfjsLib || null;
    }

    // 통합 파일 처리기 (PDF & 이미지 구분 없이 섞어서 자유자재로 불러오기 및 삽입)
    async function processFiles(files, customInsertIndex = -1, targetArea = 'center-area') {
      initHistoryAnchor();
      armUserGestureHistory();
      if (!files || files.length === 0) return;

      // .pixpdf 프로젝트 파일 드롭/선택 시 프로젝트 자동 복원
      const pixpdfFile = files.find(f => f.name.toLowerCase().endsWith('.pixpdf'));
      if (pixpdfFile) {
        if (typeof openPixPdfProject === 'function') {
          await openPixPdfProject(pixpdfFile);
        }
        return;
      }

      const pdfFiles = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
      const imgFiles = files.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|tif|tiff|jfif|ico)$/i.test(f.name));

      // 모바일 등에서 type/확장자가 생략된 파일 폴백 처리
      const otherFiles = files.filter(f => !pdfFiles.includes(f) && !imgFiles.includes(f));
      for (const f of otherFiles) {
        if (f.name.toLowerCase().endsWith('.pdf')) {
          pdfFiles.push(f);
        } else {
          imgFiles.push(f);
        }
      }

      if (pdfFiles.length === 0 && imgFiles.length === 0) return;

      const isFirstLoad = (docState.items.length === 0);
      let insertAt = customInsertIndex >= 0 ? customInsertIndex : (isFirstLoad ? 0 : docState.currentIndex + 1);

      // 1. PDF 파일 처리
      if (pdfFiles.length > 0) {
        const pdfLib = await ensurePdfJsReady();
        if (!pdfLib) {
          updateStatusMsg('PDF 엔진 로딩 중입니다. 잠시 후 다시 시도해 주세요.');
          return;
        }

        for (const pdfFile of pdfFiles) {
          updateStatusMsg(`${pdfFile.name} 로드 중...`);
          try {
            const arrayBuf = await pdfFile.arrayBuffer();
            const loadedDoc = await pdfLib.getDocument({ data: arrayBuf }).promise;
            const totalPages = loadedDoc.numPages;

          if (isFirstLoad && pdfFiles.length === 1 && imgFiles.length === 0) {
            // 최초 단일 PDF 로드 시: 전체 페이지를 기본 순서대로 등록
            const pdfFileId = registerOpenedFile(pdfFile, 'pdf', loadedDoc, totalPages);
            docState.fileName = pdfFile.name.replace(/\.[^/.]+$/, "");
            const newPages = Array.from({ length: totalPages }, (_, i) => ({
              type: 'pdf',
              fileId: pdfFileId,
              doc: loadedDoc,
              pageNum: i + 1,
              name: `${pdfFile.name} (p.${i + 1})`,
              settings: {
                ...docState.globalSettings,
                rotTarget: { ...docState.globalSettings.rotTarget }
              }
            }));
            docState.items.push(...newPages);
            docState.checkList.push(...new Array(totalPages).fill(true));
            docState.currentIndex = 0;
            document.getElementById('chkSelectAll').checked = true;
          } else if (totalPages === 1) {
            const singlePdfFileId = registerOpenedFile(pdfFile, 'pdf', loadedDoc, 1);
            const newPage = {
              type: 'pdf',
              fileId: singlePdfFileId,
              doc: loadedDoc,
              pageNum: 1,
              name: `${pdfFile.name} (p.1)`,
              settings: {
                ...docState.globalSettings,
                rotTarget: { ...docState.globalSettings.rotTarget }
              }
            };
            docState.items.splice(insertAt, 0, newPage);
            docState.checkList.splice(insertAt, 0, true);
            docState.currentIndex = insertAt;
            insertAt++;
          } else {
            // 다중 페이지 PDF 문서는 사용자가 필요한 페이지를 선택할 수 있도록 피커 모달 오픈
            openPdfPicker(loadedDoc, pdfFile, insertAt);
            return;
          }
        } catch (err) {
          console.error('PDF 로드 오류:', err);
          updateStatusMsg('PDF 문서를 읽을 수 없습니다.');
        }
      }
    }

      // 2. 이미지 파일 처리
      if (imgFiles.length > 0) {
        updateStatusMsg('이미지를 불러오는 중...');
        const newItems = [];
        for (const file of imgFiles) {
          try {
            const imgFileId = registerOpenedFile(file, 'image', null, 1);
            const imgObj = await loadImageSafe(file);
            newItems.push({
              type: 'image',
              fileId: imgFileId,
              file: file,
              imgObj: imgObj,
              name: file.name,
              width: imgObj.width,
              height: imgObj.height,
              settings: {
                ...docState.globalSettings,
                rotTarget: { ...docState.globalSettings.rotTarget }
              }
            });
          } catch (err) {
            console.error('이미지 로드 오류:', file.name, err);
          }
        }

        if (newItems.length > 0) {
          if (docState.items.length === 0) {
            docState.fileName = imgFiles[0].name.replace(/\.[^/.]+$/, "");
            docState.items.push(...newItems);
            docState.checkList.push(...new Array(newItems.length).fill(true));
            docState.currentIndex = 0;
          } else {
            docState.items.splice(insertAt, 0, ...newItems);
            docState.checkList.splice(insertAt, 0, ...new Array(newItems.length).fill(true));
            docState.currentIndex = insertAt;
          }
        }
      }

      await refreshWorkspaceDisplay();
      if (docState.items.length > 0) {
        await loadMainViewer(docState.currentIndex);
        updateStatusMsg(`${docState.items.length}개 항목이 준비되었습니다.`);
      }
    }

    async function loadImageSafe(file) {
      if (typeof createImageBitmap === 'function') {
        try {
          const bmp = await createImageBitmap(file);
          return bmp;
        } catch (e) {
          console.warn('createImageBitmap failed, fallback to FileReader', e);
        }
      }
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = (err) => reject(err || new Error("이미지 로드 실패"));
          img.src = reader.result;
        };
        reader.onerror = (err) => reject(err || new Error("파일 읽기 실패"));
        reader.readAsDataURL(file);
      });
    }

    // 1열 PDF 썸네일 렌더링 (순서 변경, 개별 삭제, 드래그 드롭 위치 삽입 지원)
    // [통합] 1열 썸네일 렌더링 (순서 변경, 개별 삭제, 드래그 드롭 위치 삽입 지원)
    async function renderThumbnailList() {
      const container = document.getElementById('thumbList');
      container.innerHTML = '';
      if (docState.items.length === 0) {
        updateThumbCounts();
        return;
      }

      docState.items.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = `thumb-card ${idx === docState.currentIndex ? 'active' : ''}`;
        card.id = `thumb-card-${idx}`;
        card.draggable = true;
        card.onclick = (e) => {
          if (e.target.closest('input[type="checkbox"]') || e.target.closest('button')) return;
          loadMainViewer(idx);
          if (window.innerWidth <= 860) {
            toggleMobileControl(true);
          }
        };

        card.addEventListener('dragstart', (e) => {
          draggedCardIndex = idx;
          card.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', idx);
        });

        card.addEventListener('dragend', () => {
          card.classList.remove('dragging');
          clearThumbDropLines();
        });

        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = card.getBoundingClientRect();
          const relY = e.clientY - rect.top;
          clearThumbDropLines();
          if (relY < rect.height / 2) {
            card.classList.add('drag-over-top');
          } else {
            card.classList.add('drag-over-bottom');
          }
        });

        card.addEventListener('dragleave', (e) => {
          e.stopPropagation();
          card.classList.remove('drag-over-top', 'drag-over-bottom');
        });

        // 카드 사이에 드롭 (새 파일 삽입 또는 순서 이동)
        card.addEventListener('drop', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = card.getBoundingClientRect();
          const isTop = (e.clientY - rect.top) < rect.height / 2;
          let insertAt = isTop ? idx : idx + 1;
          clearThumbDropLines();

          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await processFiles(Array.from(e.dataTransfer.files), insertAt, 'thumb-slot');
          } else if (draggedCardIndex !== null && draggedCardIndex !== idx) {
            const movedItem = docState.items.splice(draggedCardIndex, 1)[0];
            const movedChk = docState.checkList.splice(draggedCardIndex, 1)[0];
            if (draggedCardIndex < insertAt) insertAt--;
            docState.items.splice(insertAt, 0, movedItem);
            docState.checkList.splice(insertAt, 0, movedChk);
            docState.currentIndex = insertAt;
            await renderThumbnailList();
            loadMainViewer(insertAt);
          }
          draggedCardIndex = null;
        });

        const header = document.createElement('div');
        header.className = 'thumb-card-header';

        const titleSpan = document.createElement('span');
        const badgeType = item.type === 'image' ? ' 🖼️' : ' 📄';
        titleSpan.textContent = `#${idx + 1}${badgeType}`;
        header.appendChild(titleSpan);

        const headerRight = document.createElement('div');
        headerRight.style.display = 'flex';
        headerRight.style.alignItems = 'center';
        headerRight.style.gap = '8px';

        const btnRow = document.createElement('div');
        btnRow.className = 'thumb-btn-row';

        const btnUp = document.createElement('button');
        btnUp.className = 'btn-icon-sm';
        btnUp.textContent = '▲';
        btnUp.title = '위로 이동';
        btnUp.onclick = (e) => { e.stopPropagation(); moveItemOrder(idx, -1); };

        const btnDown = document.createElement('button');
        btnDown.className = 'btn-icon-sm';
        btnDown.textContent = '▼';
        btnDown.title = '아래로 이동';
        btnDown.onclick = (e) => { e.stopPropagation(); moveItemOrder(idx, 1); };

        const btnDel = document.createElement('button');
        btnDel.className = 'btn-icon-sm';
        btnDel.textContent = '✕';
        btnDel.title = '삭제';
        btnDel.onclick = (e) => { e.stopPropagation(); removeItem(idx); };

        btnRow.appendChild(btnUp);
        btnRow.appendChild(btnDown);
        btnRow.appendChild(btnDel);
        headerRight.appendChild(btnRow);

        const touchWrap = document.createElement('label');
        touchWrap.className = 'chk-touch-wrap';
        touchWrap.onclick = (e) => e.stopPropagation();

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = docState.checkList[idx] !== false;
        chk.onchange = () => {
          docState.checkList[idx] = chk.checked;
          updateThumbCounts();
        };
        touchWrap.appendChild(chk);
        headerRight.appendChild(touchWrap);

        header.appendChild(headerRight);
        card.appendChild(header);

        const thumbCanvasWrap = document.createElement('div');
        thumbCanvasWrap.className = 'thumb-canvas-wrap';
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.id = `thumb-canvas-${idx}`;
        thumbCanvasWrap.appendChild(thumbCanvas);
        card.appendChild(thumbCanvasWrap);
        container.appendChild(card);

        // 비동기 고화질 썸네일 렌더링 (모바일 및 고해상도 열람 시 칼같은 가독성 보장)
        (async () => {
          const cfg = getEffectiveItemSettings(idx);
          if (item.type === 'pdf' && !item.imgObj) {
            await ensureItemCanvas(item);
          }
          drawPaperWithImage(thumbCanvas, item, cfg, { isThumbnail: true });
          const isTransparent = ((cfg.format || 'png') === 'png') && (cfg.transparentBg !== false);
          if (thumbCanvasWrap) thumbCanvasWrap.classList.toggle('checkerboard-bg', isTransparent);
          updateViewerEdits(idx);
        })();
      });

      updateThumbCounts();
    }
    const renderPdfThumbnailList = renderThumbnailList;
    const renderImageThumbnailList = renderThumbnailList;

    async function moveItemOrder(index, delta) {
      const target = index + delta;
      if (target < 0 || target >= docState.items.length) return;
      const movedItem = docState.items.splice(index, 1)[0];
      const movedChk = docState.checkList.splice(index, 1)[0];
      docState.items.splice(target, 0, movedItem);
      docState.checkList.splice(target, 0, movedChk);
      docState.currentIndex = target;
      await renderThumbnailList();
      loadMainViewer(target);
    }
    const movePdfPageOrder = moveItemOrder;
    const moveImageOrder = moveItemOrder;

    async function removeItem(index) {
      docState.items.splice(index, 1);
      docState.checkList.splice(index, 1);
      if (docState.currentIndex >= docState.items.length) {
        docState.currentIndex = Math.max(0, docState.items.length - 1);
      }
      await renderThumbnailList();
      if (docState.items.length > 0) {
        loadMainViewer(docState.currentIndex);
      } else {
        refreshWorkspaceDisplay();
      }
    }
    const removePdfPageItem = removeItem;
    const removeImageItem = removeItem;

    // -------------------------------------------------------------
    // [PDF 페이지 선택 모달 (Picker Modal) 제어 함수들]
    // -------------------------------------------------------------
    function openPdfPicker(pdfDoc, file, targetInsertIndex = -1, mode = 'insert', resyncFileId = null, initialPages = []) {
      pickerState.doc = pdfDoc;
      pickerState.file = file;
      pickerState.total = pdfDoc.numPages;
      pickerState.targetInsertIndex = targetInsertIndex;
      pickerState.mode = mode;
      pickerState.resyncFileId = resyncFileId;

      if (mode === 'resync' && initialPages && initialPages.length > 0) {
        const selMap = new Set(initialPages);
        pickerState.selected = Array.from({ length: pdfDoc.numPages }, (_, i) => selMap.has(i + 1));
      } else {
        pickerState.selected = new Array(pdfDoc.numPages).fill(true);
      }
const modal = document.getElementById('modalPdfPicker');
      const title = document.getElementById('pickerModalTitle');
      const posText = document.getElementById('pickerTargetPosText');
      const chkAll = document.getElementById('chkPickerSelectAll');
      const txtRange = document.getElementById('txtPickerRange');

      const btnConfirm = document.getElementById('btnConfirmPickerInsert');
      if (mode === 'resync') {
        title.textContent = `📑 [${file.name}] 페이지 재선택 (${pdfDoc.numPages}페이지)`;
        if (btnConfirm) btnConfirm.textContent = '페이지 변경 적용';
        posText.textContent = `기존 워크스페이스 위치에서 변경된 페이지로 즉시 갱신됩니다.`;
      } else {
        title.textContent = `📑 [${file.name}] 페이지 선택 (${pdfDoc.numPages}페이지)`;
        if (btnConfirm) btnConfirm.textContent = '선택 페이지 삽입';
        if (targetInsertIndex >= 0 && targetInsertIndex < pdfState.pages.length) {
          posText.textContent = `삽입 위치: #${targetInsertIndex + 1} 앞`;
        } else {
          posText.textContent = `삽입 위치: 문서 끝`;
        }
      }

      modal.classList.add('show');
      updatePickerCount();
      renderPickerThumbnails();
      try { history.pushState({ appLayer: 'pdfPicker' }, ''); } catch (e) {}
    }

    function closePdfPickerModal(syncHistory = true) {
      const modal = document.getElementById('modalPdfPicker');
      if (modal && modal.classList.contains('show')) {
        modal.classList.remove('show');
        if (syncHistory && history.state && (history.state.appLayer === 'pdfPicker' || history.state.modal === 'pdfPicker')) {
          isClosingLayerProgrammatically = true;
          history.back();
          setTimeout(() => { isClosingLayerProgrammatically = false; }, 300);
        }
      }
      pickerState.doc = null;
      pickerState.file = null;
    }

    function onPickerModalBackdropClick(e) {
      if (e.target.id === 'modalPdfPicker') {
        closePdfPickerModal(true);
      }
    }

    function updatePickerCount() {
      const selectedCount = pickerState.selected.filter(Boolean).length;
      const countText = document.getElementById('pickerCountText');
      const chkAll = document.getElementById('chkPickerSelectAll');
      if (countText) countText.textContent = `(${selectedCount} / ${pickerState.total} 선택됨)`;
      if (chkAll) chkAll.checked = (pickerState.total > 0 && selectedCount === pickerState.total);
    }

    const chkPickerSelectAllElem = document.getElementById('chkPickerSelectAll');
    if (chkPickerSelectAllElem) {
      chkPickerSelectAllElem.addEventListener('change', (e) => {
        const checked = e.target.checked;
        pickerState.selected = pickerState.selected.map(() => checked);
        const chks = document.querySelectorAll('.picker-card input[type="checkbox"]');
        chks.forEach((c, idx) => {
          c.checked = checked;
          const card = document.getElementById(`picker-card-${idx}`);
          if (card) card.classList.toggle('selected', checked);
        });
        updatePickerCount();
      });
    }

    function applyPickerRangeFilter() {
      const input = document.getElementById('txtPickerRange');
      if (!input) return;
      const val = input.value.trim();
      if (!val) return;

      const selectedSet = new Set();
      const parts = val.split(',');
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        if (trimmed.includes('-')) {
          const [startStr, endStr] = trimmed.split('-');
          const start = parseInt(startStr, 10);
          const end = parseInt(endStr, 10);
          if (!isNaN(start) && !isNaN(end)) {
            const min = Math.max(1, Math.min(start, end));
            const max = Math.min(pickerState.total, Math.max(start, end));
            for (let p = min; p <= max; p++) selectedSet.add(p);
          }
        } else {
          const p = parseInt(trimmed, 10);
          if (!isNaN(p) && p >= 1 && p <= pickerState.total) {
            selectedSet.add(p);
          }
        }
      }

      pickerState.selected = pickerState.selected.map((_, i) => selectedSet.has(i + 1));
      pickerState.selected.forEach((isSelected, idx) => {
        const chk = document.getElementById(`picker-chk-${idx}`);
        if (chk) chk.checked = isSelected;
        const card = document.getElementById(`picker-card-${idx}`);
        if (card) card.classList.toggle('selected', isSelected);
      });
      updatePickerCount();
    }

    async function renderPickerThumbnails() {
      const grid = document.getElementById('pickerGrid');
      grid.innerHTML = '';
      const total = pickerState.total;
      const doc = pickerState.doc;
      if (!doc) return;

      for (let i = 1; i <= total; i++) {
        const card = document.createElement('div');
        card.className = `picker-card ${pickerState.selected[i - 1] ? 'selected' : ''}`;
        card.id = `picker-card-${i - 1}`;

        const numBadge = document.createElement('span');
        numBadge.className = 'picker-card-num';
        numBadge.textContent = `#${i}`;
        card.appendChild(numBadge);

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.id = `picker-chk-${i - 1}`;
        chk.className = 'picker-card-chk';
        chk.checked = pickerState.selected[i - 1];
        chk.onclick = (e) => e.stopPropagation();
        chk.onchange = () => {
          pickerState.selected[i - 1] = chk.checked;
          card.classList.toggle('selected', chk.checked);
          updatePickerCount();
        };
        card.appendChild(chk);

        card.onclick = () => {
          chk.checked = !chk.checked;
          pickerState.selected[i - 1] = chk.checked;
          card.classList.toggle('selected', chk.checked);
          updatePickerCount();
        };

        // 경량 썸네일 캔버스 (scale 0.25 로 메모리 보호)
        const canvas = document.createElement('canvas');
        canvas.className = 'picker-thumb-canvas';
        card.appendChild(canvas);
        grid.appendChild(card);

        // 비동기 렌더링
        (async () => {
          try {
            const page = await doc.getPage(i);
            const vp = page.getViewport({ scale: 0.25 });
            canvas.width = vp.width;
            canvas.height = vp.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, vp.width, vp.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
          } catch (e) {
            console.error(e);
          }
        })();

        if (i % 6 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }
    }

    async function confirmPickerInsert() {
      const selectedNums = [];
      pickerState.selected.forEach((sel, i) => {
        if (sel) selectedNums.push(i + 1);
      });

      if (selectedNums.length === 0) {
        alert(pickerState.mode === 'resync' 
          ? '최소 1개 이상의 페이지를 선택해야 합니다. (파일 전체를 제외하려면 파일 관리의 [파일 제외]를 사용하세요.)' 
          : '삽입할 페이지를 1개 이상 선택해 주세요.');
        return;
      }

      if (pickerState.mode === 'resync') {
        const fileId = pickerState.resyncFileId;
        const oldSettingsMap = new Map();
        let firstIdx = -1;

        docState.items.forEach((it, idx) => {
          if (it.fileId === fileId) {
            if (firstIdx === -1) firstIdx = idx;
            if (it.pageNum && it.settings) {
              oldSettingsMap.set(it.pageNum, it.settings);
            }
          }
        });
        if (firstIdx === -1) firstIdx = docState.items.length;

        const newPages = selectedNums.map(pageNum => ({
          type: 'pdf',
          fileId: fileId,
          file: pickerState.file,
          doc: pickerState.doc,
          pageNum: pageNum,
          name: `${pickerState.file.name} (p.${pageNum})`,
          settings: oldSettingsMap.get(pageNum) || {
            ...docState.globalSettings,
            rotTarget: { ...docState.globalSettings.rotTarget }
          }
        }));
        const newChecks = new Array(newPages.length).fill(true);

        const updatedItems = [];
        const updatedChecks = [];
        let inserted = false;

        for (let i = 0; i < docState.items.length; i++) {
          if (docState.items[i].fileId === fileId) {
            if (!inserted) {
              updatedItems.push(...newPages);
              updatedChecks.push(...newChecks);
              inserted = true;
            }
          } else {
            updatedItems.push(docState.items[i]);
            updatedChecks.push(docState.checkList[i]);
          }
        }
        if (!inserted) {
          updatedItems.push(...newPages);
          updatedChecks.push(...newChecks);
        }

        docState.items = updatedItems;
        docState.checkList = updatedChecks;
        docState.currentIndex = Math.min(firstIdx, docState.items.length - 1);

        closePdfPickerModal();
        await refreshWorkspaceDisplay();
        await loadMainViewer(docState.currentIndex);
        updateStatusMsg(`[${pickerState.file.name}] 페이지가 ${newPages.length}장으로 갱신되었습니다.`);
        return;
      }

      // 일반 insert 모드
      const insertFileId = registerOpenedFile(pickerState.file, 'pdf', pickerState.doc, pickerState.total);
      const newPages = selectedNums.map(pageNum => ({
        type: 'pdf',
        fileId: insertFileId,
        file: pickerState.file,
        doc: pickerState.doc,
        pageNum: pageNum,
        name: `${pickerState.file.name} (p.${pageNum})`,
        settings: {
          ...pdfState.globalSettings,
          rotTarget: { ...pdfState.globalSettings.rotTarget }
        }
      }));

      const newChecks = new Array(newPages.length).fill(true);
      const targetPos = pickerState.targetInsertIndex;

      if (targetPos >= 0 && targetPos <= pdfState.pages.length) {
        pdfState.pages.splice(targetPos, 0, ...newPages);
        pdfState.checkList.splice(targetPos, 0, ...newChecks);
        pdfState.currentIndex = targetPos;
      } else {
        const insertPos = pdfState.pages.length;
        pdfState.pages.splice(insertPos, 0, ...newPages);
        pdfState.checkList.splice(insertPos, 0, ...newChecks);
        pdfState.currentIndex = insertPos;
      }

      closePdfPickerModal();
      await refreshWorkspaceDisplay();
      await loadMainViewer(pdfState.currentIndex);
      updateStatusMsg(`${newPages.length}개 페이지가 삽입되었습니다.`);
    }

    document.getElementById('chkSelectAll').addEventListener('change', (e) => {
      const checked = e.target.checked;
      docState.checkList = docState.checkList.map(() => checked);
      document.querySelectorAll('#thumbList input[type="checkbox"]').forEach(c => c.checked = checked);
      updateThumbCounts();
    });

    function updateThumbCounts() {
      const btnSavePdf = document.getElementById('btnSavePdf');
      const btnSaveImg = document.getElementById('btnSaveImg');
      const btnAction = document.getElementById('btnAction');

      if (docState.items.length === 0) {
        document.getElementById('thumbCount').textContent = '0/0';
        document.getElementById('chkSelectAll').checked = false;
        if (btnSavePdf) btnSavePdf.disabled = true;
        if (btnSaveImg) btnSaveImg.disabled = true;
        if (btnAction) btnAction.disabled = true;
      } else {
        const selected = docState.checkList.filter(Boolean).length;
        const total = docState.items.length;
        document.getElementById('thumbCount').textContent = `${selected}/${total}`;
        document.getElementById('chkSelectAll').checked = (total > 0 && selected === total);
        const isDisabled = selected === 0;
        if (btnSavePdf) btnSavePdf.disabled = isDisabled;
        if (btnSaveImg) btnSaveImg.disabled = isDisabled;
        if (btnAction) btnAction.disabled = isDisabled;
      }

      // 모바일 플로팅 버튼(FAB) 상태 갱신 (데스크톱에서는 CSS display: none !important 유지)
      const totalCount = docState.items.length;
      const fab = document.getElementById('mobileFab');
      if (fab) {
        fab.classList.toggle('has-files', totalCount > 0);
        fab.style.display = '';
        fab.textContent = '⚙️ 편집 & 저장';
      }
    }

    function clearThumbDropLines() {
      document.querySelectorAll('.thumb-card').forEach(c => {
        c.classList.remove('drag-over-top', 'drag-over-bottom');
      });
    }

    // 2열 메인 뷰어 캔버스 렌더링 (용지 규격 + 여백 + 회전 + 맞춤 비율 정밀 반영)
    let currentRenderTask = null;
