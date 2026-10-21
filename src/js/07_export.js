    async function executeActionSave(targetType) {
      if (targetType === 'img') {
        await executeSaveSplitImages();
      } else {
        await executeSaveMergedPdf();
      }
      toggleMobileControl(false);
    }

    // 선택된 항목들을 고화질 이미지로 개별/ZIP 분할 저장 (PDF/이미지 혼합 완벽 지원)
    async function executeSaveSplitImages() {
      if (docState.items.length === 0) return;
      const selectedIndices = [];
      docState.checkList.forEach((chk, i) => { if (chk && docState.items[i]) selectedIndices.push(i); });
      if (selectedIndices.length === 0) return;

      const btnSavePdf = document.getElementById('btnSavePdf');
      const btnSaveImg = document.getElementById('btnSaveImg');
      const btnAbort = document.getElementById('btnAbort');
      const progWrap = document.getElementById('progWrap');
      const progFill = document.getElementById('progFill');

      if (btnSavePdf) btnSavePdf.disabled = true;
      if (btnSaveImg) btnSaveImg.disabled = true;
      if (btnAbort) btnAbort.style.display = 'inline-block';
      if (progWrap) progWrap.style.display = 'block';
      isAborted = false;
      const exportBlobs = [];

      try {
        for (let idx = 0; idx < selectedIndices.length; idx++) {
          if (isAborted) {
            updateStatusMsg('변환이 중단되었습니다.');
            break;
          }

          const pageIndex = selectedIndices[idx];
          const p = docState.items[pageIndex];
          const cfg = getEffectiveItemSettings(pageIndex);
          const { isPageRot90 } = getResolvedRotations(cfg);

          const pct = Math.round(((idx + 1) / selectedIndices.length) * 100);
          if (progFill) progFill.style.width = `${pct}%`;
          updateStatusMsg(`이미지 변환 중: [${idx + 1} / ${selectedIndices.length}] (${pct}%)...`);

          await new Promise(r => setTimeout(r, 0));

          if (p.type === 'pdf' && !p.imgObj) {
            await ensureItemCanvas(p);
          }

          const isPaperCrop = Boolean(cfg.crop && cfg.crop.cropPaper);
          const fullOrigW = p.width || (p.imgObj ? (p.imgObj.naturalWidth || p.imgObj.width) : 1200);
          const fullOrigH = p.height || (p.imgObj ? (p.imgObj.naturalHeight || p.imgObj.height) : 1600);

          let origW, origH;
          if (isPaperCrop) {
            const effDims = (typeof getEffectiveImageDimensions === 'function') ? getEffectiveImageDimensions(p) : { width: fullOrigW, height: fullOrigH };
            origW = effDims.width;
            origH = effDims.height;
          } else {
            origW = fullOrigW;
            origH = fullOrigH;
          }

          const baseOrigW = isPageRot90 ? origH : origW;
          const baseOrigH = isPageRot90 ? origW : origH;
          const imgF = (p.type === 'pdf') ? 1 : getImagePageFactor(fullOrigW, fullOrigH);
          const scaleMul = (p.type === 'pdf') ? cfg.scale : imgF;
          const refW = baseOrigW * scaleMul, refH = baseOrigH * scaleMul;
          const isOrigLandscape = origW > origH;
          const orientOpt = cfg.orient || 'auto';
          const baseLandscape = orientOpt === 'l' || (orientOpt === 'auto' && isOrigLandscape);
          const isLandscape = isPageRot90 ? !baseLandscape : baseLandscape;
          let sizeKey = cfg.fit || cfg.pageSize || 'original';
          if (isPaperCrop) sizeKey = 'custom';
          const customW = isPaperCrop ? refW : cfg.customW;
          const customH = isPaperCrop ? refH : cfg.customH;
          const paper = resolvePaperGeometry(sizeKey, isLandscape, refW, refH, customW, customH);

          let paperW, paperH;
          if (cfg.fit === 'original' || cfg.pageSize === 'original') {
            paperW = isPaperCrop ? Math.round(paper.widthPx) : Math.round(baseOrigW * scaleMul);
            paperH = isPaperCrop ? Math.round(paper.heightPx) : Math.round(baseOrigH * scaleMul);
          } else if (cfg.fit === 'custom' || cfg.pageSize === 'custom' || isPaperCrop) {
            paperW = Math.round(paper.widthPx);
            paperH = Math.round(paper.heightPx);
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
          drawPaperWithImage(finalCanvas, p, cfg, { targetWidth: paperW, targetHeight: paperH });
          const fctx = finalCanvas.getContext('2d');

          let blob;
          const fmt = cfg.format || 'png';
          if (fmt === 'png') {
            blob = await new Promise(r => finalCanvas.toBlob(r, 'image/png'));
          } else if (fmt === 'jpeg') {
            blob = await new Promise(r => finalCanvas.toBlob(r, 'image/jpeg', 0.95));
          } else if (fmt === 'webp') {
            blob = await new Promise(r => finalCanvas.toBlob(r, 'image/webp', 0.95));
          } else if (fmt === 'bmp') {
            blob = CustomEncoders.canvasToBMP(fctx, finalCanvas.width, finalCanvas.height);
          } else if (fmt === 'ico') {
            blob = await CustomEncoders.canvasToICO(finalCanvas);
          } else if (fmt === 'tiff') {
            blob = CustomEncoders.canvasToTIFF(fctx, finalCanvas.width, finalCanvas.height);
          }

          finalCanvas.width = 0; finalCanvas.height = 0;

          const baseName = docState.fileName || 'document';
          const fileName = `${baseName}_p${String(idx + 1).padStart(3, '0')}.${fmt}`;
          exportBlobs.push({ name: fileName, blob });
        }

        if (!isAborted) {
          if (exportBlobs.length === 1) {
            // 단일 파일 다운로드
            const item = exportBlobs[0];
            const url = URL.createObjectURL(item.blob);
            const a = document.createElement('a');
            a.download = item.name;
            a.href = url;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            updateStatusMsg('완료! 이미지 1장 저장됨.');
          } else {
            // 다중 파일 ZIP 압축 다운로드
            updateStatusMsg('ZIP 파일 생성 중...');
            const zip = new JSZip();
            exportBlobs.forEach(item => zip.file(item.name, item.blob));
            const zipBlob = await zip.generateAsync({ type: 'blob' });

            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            const baseName = docState.fileName || 'document';
            a.download = `${baseName}_images.zip`;
            a.href = url;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 2000);

            updateStatusMsg(`완료! ${exportBlobs.length}장 이미지 저장됨.`);
          }
        }
      } catch (err) {
        console.error(err);
        updateStatusMsg(`오류: ${err.message}`);
      } finally {
        updateThumbCounts();
        if (btnAbort) btnAbort.style.display = 'none';
        if (progWrap) progWrap.style.display = 'none';
      }
    }

    // 선택된 항목들을 순서대로 하나의 PDF 문서로 병합 저장 (PDF/이미지 혼합 완벽 지원)
    async function executeSaveMergedPdf() {
      if (docState.items.length === 0) return;
      const selectedIndices = [];
      docState.checkList.forEach((chk, i) => { if (chk && docState.items[i]) selectedIndices.push(i); });
      if (selectedIndices.length === 0) return;

      const btnSavePdf = document.getElementById('btnSavePdf');
      const btnSaveImg = document.getElementById('btnSaveImg');
      const btnAbort = document.getElementById('btnAbort');
      const progWrap = document.getElementById('progWrap');
      const progFill = document.getElementById('progFill');

      if (btnSavePdf) btnSavePdf.disabled = true;
      if (btnSaveImg) btnSaveImg.disabled = true;
      if (btnAbort) btnAbort.style.display = 'inline-block';
      if (progWrap) progWrap.style.display = 'block';
      isAborted = false;

      try {
        const jspdfModule = window.jspdf;
        if (!jspdfModule || !jspdfModule.jsPDF) {
          throw new Error('jsPDF 라이브러리를 로드할 수 없습니다.');
        }
        const { jsPDF } = jspdfModule;
        let newPdfDoc = null;

        for (let idx = 0; idx < selectedIndices.length; idx++) {
          if (isAborted) {
            updateStatusMsg('PDF 생성이 중단되었습니다.');
            break;
          }

          const pageIndex = selectedIndices[idx];
          const p = docState.items[pageIndex];
          const cfg = getEffectiveItemSettings(pageIndex);
          const { isPageRot90 } = getResolvedRotations(cfg);

          const pct = Math.round(((idx + 1) / selectedIndices.length) * 100);
          if (progFill) progFill.style.width = `${pct}%`;
          updateStatusMsg(`PDF 생성 중: [${idx + 1} / ${selectedIndices.length}] (${pct}%)...`);

          await new Promise(r => setTimeout(r, 0));

          if (p.type === 'pdf' && !p.imgObj) {
            await ensureItemCanvas(p);
          }

          const isPaperCrop = Boolean(cfg.crop && cfg.crop.cropPaper);
          const fullOrigW = p.width || (p.imgObj ? (p.imgObj.naturalWidth || p.imgObj.width) : 1200);
          const fullOrigH = p.height || (p.imgObj ? (p.imgObj.naturalHeight || p.imgObj.height) : 1600);

          let origW, origH;
          if (isPaperCrop) {
            const effDims = (typeof getEffectiveImageDimensions === 'function') ? getEffectiveImageDimensions(p) : { width: fullOrigW, height: fullOrigH };
            origW = effDims.width;
            origH = effDims.height;
          } else {
            origW = fullOrigW;
            origH = fullOrigH;
          }

          const baseOrigW = isPageRot90 ? origH : origW;
          const baseOrigH = isPageRot90 ? origW : origH;
          const imgF = (p.type === 'pdf') ? 1 : getImagePageFactor(fullOrigW, fullOrigH);
          const scaleMul = (p.type === 'pdf') ? 2.5 : imgF;
          const refW = baseOrigW * scaleMul, refH = baseOrigH * scaleMul;
          const isOrigLandscape = origW > origH;
          const orientOpt = cfg.orient || 'auto';
          const baseLandscape = orientOpt === 'l' || (orientOpt === 'auto' && isOrigLandscape);
          const isLandscape = isPageRot90 ? !baseLandscape : baseLandscape;
          let sizeKey = cfg.fit || cfg.pageSize || 'original';
          if (isPaperCrop) sizeKey = 'custom';
          const customW = isPaperCrop ? refW : cfg.customW;
          const customH = isPaperCrop ? refH : cfg.customH;
          const paper = resolvePaperGeometry(sizeKey, isLandscape, refW, refH, customW, customH);

          let paperW, paperH;
          if (cfg.fit === 'original' || cfg.pageSize === 'original') {
            paperW = isPaperCrop ? Math.round(paper.widthPx) : Math.round(baseOrigW * scaleMul);
            paperH = isPaperCrop ? Math.round(paper.heightPx) : Math.round(baseOrigH * scaleMul);
          } else if (cfg.fit === 'custom' || cfg.pageSize === 'custom' || isPaperCrop) {
            paperW = Math.round(paper.widthPx);
            paperH = Math.round(paper.heightPx);
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
          drawPaperWithImage(finalCanvas, p, cfg, { targetWidth: paperW, targetHeight: paperH });

          // 무손실 PNG 데이터 추출
          const imgDataUrl = finalCanvas.toDataURL('image/png');
          finalCanvas.width = 0; finalCanvas.height = 0;

          // [ADR-027] PDF 페이지를 실제 mm 크기로 기록 (px 단위 거대 페이지로 인한 인쇄 시 확대·잘림 방지)
          // 종이 연동은 (A)안: 잘린 크기 그대로의 작은 페이지이되, 원래 용지와 동일한 실제 축척을 유지
          const outScale = getOutputPaperScale(p, cfg, scaleMul);
          const contentMul = isPaperCrop ? outScale.imgFit : 1;
          const pgW = Math.max(1, Math.round(paperW * outScale.mmPerPx * contentMul * 100) / 100);
          const pgH = Math.max(1, Math.round(paperH * outScale.mmPerPx * contentMul * 100) / 100);
          const orientation = pgW > pgH ? 'l' : 'p';
          if (idx === 0) {
            newPdfDoc = new jsPDF({
              orientation: orientation,
              unit: 'mm',
              format: [pgW, pgH],
              compress: true
            });
          } else {
            newPdfDoc.addPage([pgW, pgH], orientation);
          }

          newPdfDoc.addImage(imgDataUrl, 'PNG', 0, 0, pgW, pgH, undefined, 'FAST');
        }

        if (!isAborted && newPdfDoc) {
          const baseName = docState.fileName || 'document';
          newPdfDoc.save(`${baseName}_edited.pdf`);
          updateStatusMsg(`완료! ${selectedIndices.length}페이지 PDF 저장됨.`);
        }
      } catch (err) {
        console.error(err);
        updateStatusMsg(`PDF 생성 오류: ${err.message}`);
      } finally {
        updateThumbCounts();
        if (btnAbort) btnAbort.style.display = 'none';
        if (progWrap) progWrap.style.display = 'none';
      }
    }

    function abortAction() {
      isAborted = true;
      const btnAbort = document.getElementById('btnAbort');
      if (btnAbort) btnAbort.disabled = true;
    }
