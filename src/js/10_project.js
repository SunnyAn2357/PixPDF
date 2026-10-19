    // ==========================================================================
    // [MODULE] 10_project.js
    // PixPDF 전용 프로젝트 파일(*.pixpdf) 무결성 저장 및 복원 엔진
    // ==========================================================================

    // 프로젝트 저장 트리거 (햄버거 메뉴 등에서 호출)
    async function triggerSaveProject() {
      const menuDropdown = document.getElementById('menuDropdown');
      if (menuDropdown) menuDropdown.classList.remove('show');

      if (!docState || docState.items.length === 0) {
        if (typeof showExitToast === 'function') showExitToast('저장할 작업 문서가 없습니다.');
        return;
      }

      if (typeof JSZip === 'undefined') {
        if (typeof showExitToast === 'function') showExitToast('압축 엔진(JSZip)이 로드되지 않았습니다.');
        return;
      }

      if (typeof showExitToast === 'function') showExitToast('프로젝트 파일(.pixpdf) 생성 중...');

      try {
        const zip = new JSZip();

        const projectMeta = {
          version: '2.11.5',
          appName: 'PixPDF',
          createdAt: new Date().toISOString(),
          fileName: docState.fileName || 'PixPDF_Project',
          currentIndex: docState.currentIndex || 0,
          globalSettings: JSON.parse(JSON.stringify(docState.globalSettings || {})),
          checkList: [...(docState.checkList || [])],
          items: []
        };

        const mediaFolder = zip.folder('media');

        for (let i = 0; i < docState.items.length; i++) {
          const item = docState.items[i];
          const mediaName = `page_${String(i + 1).padStart(3, '0')}.png`;

          // 원본 캔버스 확보
          if (typeof ensureItemCanvas === 'function') {
            await ensureItemCanvas(item);
          }

          let blob = null;
          if (item.imgObj instanceof HTMLCanvasElement) {
            blob = await new Promise(r => item.imgObj.toBlob(r, 'image/png'));
          } else if (item.imgObj) {
            const tempC = document.createElement('canvas');
            const w = item.imgObj.naturalWidth || item.imgObj.width || item.width || 800;
            const h = item.imgObj.naturalHeight || item.imgObj.height || item.height || 600;
            tempC.width = w;
            tempC.height = h;
            const tctx = tempC.getContext('2d');
            tctx.drawImage(item.imgObj, 0, 0);
            blob = await new Promise(r => tempC.toBlob(r, 'image/png'));
            tempC.width = 0; tempC.height = 0;
          }

          if (blob) {
            mediaFolder.file(mediaName, blob);
          }

          projectMeta.items.push({
            name: item.name || `페이지_${i + 1}`,
            type: 'image', // 프로젝트 복원 시 무손실 고화질 래스터 객체로 로드
            width: item.width || (blob ? 1000 : 800),
            height: item.height || 1000,
            pageNum: item.pageNum || (i + 1),
            mediaFile: `media/${mediaName}`,
            settings: JSON.parse(JSON.stringify(item.settings || {}))
          });
        }

        zip.file('project.json', JSON.stringify(projectMeta, null, 2));

        const zipBlob = await zip.generateAsync({
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        });

        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        const baseName = (docState.fileName || 'PixPDF').replace(/\.[^/.]+$/, '');
        const filename = `${baseName}_${dateStr}.pixpdf`;

        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(url), 2000);

        if (typeof showExitToast === 'function') showExitToast(`프로젝트가 저장되었습니다: ${filename}`);
      } catch (err) {
        console.error('[Project Save Error]', err);
        if (typeof showExitToast === 'function') showExitToast(`저장 실패: ${err.message}`);
      }
    }

    // 프로젝트 파일 열기 다이얼로그 트리거
    function triggerOpenProjectDialog() {
      const menuDropdown = document.getElementById('menuDropdown');
      if (menuDropdown) menuDropdown.classList.remove('show');

      const input = document.getElementById('inputPixPdfProject');
      if (input) {
        input.value = '';
        input.click();
      }
    }

    // 숨겨진 input 변경 이벤트 핸들러
    async function handlePixPdfProjectInput(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await openPixPdfProject(file);
      } finally {
        e.target.value = '';
      }
    }

    // .pixpdf 파일 파싱 및 워크스페이스 100% 완전 복원
    async function openPixPdfProject(file) {
      if (!file) return;

      if (typeof JSZip === 'undefined') {
        if (typeof showExitToast === 'function') showExitToast('압축 엔진(JSZip)이 로드되지 않았습니다.');
        return;
      }

      if (typeof showExitToast === 'function') showExitToast(`${file.name} 프로젝트 불러오는 중...`);

      try {
        const zip = await JSZip.loadAsync(file);
        const metaFile = zip.file('project.json');
        if (!metaFile) {
          throw new Error('올바른 PixPDF 프로젝트 파일이 아닙니다 (project.json 누락).');
        }

        const metaText = await metaFile.async('text');
        const meta = JSON.parse(metaText);

        if (!meta.items || !Array.isArray(meta.items)) {
          throw new Error('프로젝트 파일 내 페이지 목록이 손상되었습니다.');
        }

        // 기존 상태 정리
        docState.items = [];
        docState.checkList = [];
        docState.fileName = meta.fileName || file.name.replace(/\.pixpdf$/i, '');
        if (meta.globalSettings) {
          docState.globalSettings = { ...docState.globalSettings, ...meta.globalSettings };
        }

        const projectFileId = `proj_${Date.now()}`;
        docState.openedFiles = [{
          fileId: projectFileId,
          name: file.name,
          type: 'project',
          totalCount: meta.items.length
        }];

        for (let i = 0; i < meta.items.length; i++) {
          const itemMeta = meta.items[i];
          const mediaEntry = zip.file(itemMeta.mediaFile);
          if (!mediaEntry) continue;
          const imgBlob = await mediaEntry.async('blob');

          let imgObj = null;
          if (typeof createImageBitmap === 'function') {
            try {
              imgObj = await createImageBitmap(imgBlob);
            } catch (e) {
              imgObj = null;
            }
          }
          if (!imgObj) {
            const blobUrl = URL.createObjectURL(imgBlob);
            const img = new Image();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = blobUrl;
            });
            imgObj = img;
            setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
          }

          docState.items.push({
            name: itemMeta.name || `페이지_${i + 1}`,
            type: 'image',
            fileId: projectFileId,
            width: itemMeta.width || imgObj.width || (imgObj.naturalWidth || 800),
            height: itemMeta.height || imgObj.height || (imgObj.naturalHeight || 600),
            pageNum: itemMeta.pageNum || (i + 1),
            imgObj: imgObj,
            settings: itemMeta.settings || {}
          });

          const isChecked = (meta.checkList && meta.checkList[i] !== undefined) ? Boolean(meta.checkList[i]) : true;
          docState.checkList.push(isChecked);
        }

        if (docState.items.length === 0) {
          if (typeof showExitToast === 'function') showExitToast('프로젝트 내 복원 가능한 페이지가 없습니다.');
          return;
        }

        docState.currentIndex = Math.max(0, Math.min(meta.currentIndex || 0, docState.items.length - 1));

        // UI 및 3개 창 전체 동기화 갱신
        if (typeof refreshWorkspaceDisplay === 'function') {
          await refreshWorkspaceDisplay();
        } else {
          const emptyMsg = document.getElementById('viewerEmptyMsg');
          if (emptyMsg) emptyMsg.style.display = 'none';
          if (typeof renderThumbnailList === 'function') await renderThumbnailList();
          if (typeof loadMainViewer === 'function') await loadMainViewer(docState.currentIndex);
          if (typeof updateThumbCounts === 'function') updateThumbCounts();
        }

        if (typeof showExitToast === 'function') {
          showExitToast(`프로젝트가 복원되었습니다! (${docState.items.length}개 페이지)`);
        }
      } catch (err) {
        console.error('[Project Open Error]', err);
        if (typeof showExitToast === 'function') showExitToast(`프로젝트 열기 실패: ${err.message}`);
      }
    }
