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
      if (btnSavePdf) btnSavePdf.disabled = true;
      if (btnSaveImg) btnSaveImg.disabled = true;
      document.getElementById('btnAbort').style.display = 'inline-block';
      document.getElementById('progWrap').style.display = 'block';
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
          const cScale = cfg.contentScale || 1.0;
          const { rotImg, isPageRot90, isImgRot90 } = getResolvedRotations(cfg);

          const pct = Math.round(((idx + 1) / selectedIndices.length) * 100);
          document.getElementById('progFill').style.width = `${pct}%`;
          updateStatusMsg(`이미지 변환 중: [${idx + 1} / ${selectedIndices.length}] (${pct}%)...`);

          await new Promise(r => setTimeout(r, 0));

          const tempCanvas = document.createElement('canvas');
          let origW = 0, origH = 0;
          let baseScaleW = 0, baseScaleH = 0;

          if (p.type === 'pdf') {
            const page = await p.doc.getPage(p.pageNum);
            const vp = await renderPdfPageToCanvas(page, cfg.scale, rotImg, tempCanvas);

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
            const isTransparent = (cfg.format === 'png') && (cfg.transparentBg !== false);
            if (isTransparent) {
              tctx.clearRect(0, 0, srcRotW, srcRotH);
            } else {
              tctx.fillStyle = '#ffffff';
              tctx.fillRect(0, 0, srcRotW, srcRotH);
            }
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
          const scaleMul = (p.type === 'pdf') ? cfg.scale : imgF;
          const refW = baseOrigW * scaleMul, refH = baseOrigH * scaleMul;
          const isOrigLandscape = origW > origH;
          const orientOpt = cfg.orient || 'auto';
          const baseLandscape = orientOpt === 'l' || (orientOpt === 'auto' && isOrigLandscape);
          const isLandscape = isPageRot90 ? !baseLandscape : baseLandscape;
          const paper = resolvePaperGeometry(cfg.fit || cfg.pageSize || 'original', isLandscape, refW, refH, cfg.customW, cfg.customH);

          // 2단계: 최종 용지 캔버스 생성
          let finalCanvas = document.createElement('canvas');
          let fctx = finalCanvas.getContext('2d');

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

          finalCanvas.width = paperW;
          finalCanvas.height = paperH;

          // 용지 배경 채우기 (흰색 또는 PNG 투명 처리)
          const isTransparent = (cfg.format === 'png') && (cfg.transparentBg !== false);
          if (isTransparent) {
            fctx.clearRect(0, 0, paperW, paperH);
          } else {
            fctx.fillStyle = '#ffffff';
            fctx.fillRect(0, 0, paperW, paperH);
          }

          const scaleX = cfg.scaleX !== undefined ? cfg.scaleX : 1.0;
          const brightness = cfg.brightness !== undefined ? cfg.brightness : 100;
          const contrast = cfg.contrast !== undefined ? cfg.contrast : 100;
          const offsetX = cfg.offsetX !== undefined ? cfg.offsetX : 0;
          const offsetY = cfg.offsetY !== undefined ? cfg.offsetY : 0;

          // 내용물 맞춤 크기 계산
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
        document.getElementById('btnAbort').style.display = 'none';
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
      if (btnSavePdf) btnSavePdf.disabled = true;
      if (btnSaveImg) btnSaveImg.disabled = true;
      document.getElementById('btnAbort').style.display = 'inline-block';
      document.getElementById('progWrap').style.display = 'block';
      isAborted = false;

      const { jsPDF } = window.jspdf;
      let newPdfDoc = null;

      try {
        for (let idx = 0; idx < selectedIndices.length; idx++) {
          if (isAborted) {
            updateStatusMsg('PDF 생성이 중단되었습니다.');
            break;
          }

          const pageIndex = selectedIndices[idx];
          const p = docState.items[pageIndex];
          const cfg = getEffectiveItemSettings(pageIndex);
          const cScale = cfg.contentScale || 1.0;
          const { rotImg, isPageRot90, isImgRot90 } = getResolvedRotations(cfg);

          const pct = Math.round(((idx + 1) / selectedIndices.length) * 100);
          document.getElementById('progFill').style.width = `${pct}%`;
          updateStatusMsg(`PDF 생성 중: [${idx + 1} / ${selectedIndices.length}] (${pct}%)...`);

          await new Promise(r => setTimeout(r, 0));

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

          // 무손실 PNG 데이터 추출
          const imgDataUrl = finalCanvas.toDataURL('image/png');
          finalCanvas.width = 0; finalCanvas.height = 0;

          const orientation = isLandscape ? 'l' : 'p';
          if (idx === 0) {
            newPdfDoc = new jsPDF({
              orientation: orientation,
              unit: 'px',
              format: [paperW, paperH],
              compress: true
            });
          } else {
            newPdfDoc.addPage([paperW, paperH], orientation);
          }

          newPdfDoc.addImage(imgDataUrl, 'PNG', 0, 0, paperW, paperH, undefined, 'FAST');
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
        document.getElementById('btnAbort').style.display = 'none';
      }
    }

    function abortAction() {
      isAborted = true;
      document.getElementById('btnAbort').disabled = true;
    }
