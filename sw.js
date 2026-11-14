// MY PDF / PixPDF Service Worker - 100% 로컬 오프라인 구동 및 원클릭 무중단 자동 업데이트
const CACHE_NAME = 'mypdf-cache-v1.3.7';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './pixpdf.html',
  './manifest.json',
  './favicon.svg',
  './favicon.ico',
  './favicon-32x32.png',
  './favicon-16x16.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './libs/pdfjs/pdf.min.js',
  './libs/pdfjs/pdf.worker.min.js',
  './libs/pdf-lib.min.js',
  './libs/jszip.min.js',
  './libs/jspdf.umd.min.js',
  './libs/UTIF.min.js'
];

// 1. 설치(install) 즉시 이전 버전 대기 없이 강제 활성화 (skipWaiting)
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[PWA SW] 사전 캐시 스킵:', asset, err);
        }
      }
    })
  );
});

// 2. 활성화(activate) 즉시 모든 열린 탭/클라이언트 제어권 즉각 장악 (clients.claim) & 구버전 캐시 일괄 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 3. 클라이언트(페이지)로부터 수신한 skipWaiting 메시지 즉각 처리
self.addEventListener('message', (event) => {
  if (event.data && (event.data.action === 'skipWaiting' || event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

// 4. 요청 가로채기(fetch): HTML 문서는 Network-First(최신 우선), 정적 에셋은 Cache-First
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isHtml = event.request.mode === 'navigate' ||
                 event.request.headers.get('accept')?.includes('text/html') ||
                 url.pathname.endsWith('.html') ||
                 url.pathname.endsWith('/');

  // [HTML 문서 / Navigation] 최신 배포본 즉시 반영을 위한 Network-First (오프라인 시에만 캐시 폴백)
  if (isHtml) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  // [정적 에셋 / 라이브러리 / 이미지] Stale-While-Revalidate 전략
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {});

      return cachedResponse || fetchPromise;
    })
  );
});
