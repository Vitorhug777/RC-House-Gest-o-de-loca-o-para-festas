/* =========================================================================
   RC House — Service Worker
   • Pré-cache de todo o app (funciona offline depois da 1ª visita)
   • HTML/JS/CSS: rede primeiro (atualizações aparecem logo), cache como reserva offline
   • Imagens/fontes: cache primeiro, atualizando em 2º plano
   Ao publicar uma nova versão, aumente o número em VERSION.
   ========================================================================= */
const VERSION = 'rc-house-v1.9.0';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './css/app.css',
  './css/contract.css',
  './js/config.js',
  './js/icons.js',
  './js/logo-data.js',
  './js/utils.js',
  './js/store.js',
  './js/sync.js',
  './js/signature-pad.js',
  './js/contract.js',
  './js/app.js',
  './vendor/html2canvas.min.js',
  './vendor/jspdf.umd.min.js',
  './assets/fonts/PlusJakartaSans-var.woff',
  './assets/fonts/PlayfairDisplay-var.woff',
  './assets/fonts/PlayfairDisplay-Italic-var.woff',
  './assets/brand/logo-rc-house.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png',
  './assets/img/IMG_0317.jpg',
  './assets/img/thumbs/IMG_0317.jpg',
  './assets/img/thumbs/IMG_0319.jpg',
  './assets/img/thumbs/IMG_0321.jpg',
  './assets/img/thumbs/IMG_0334.jpg',
  './assets/img/thumbs/IMG_0338.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // links externos (wa.me, etc.) ficam com o navegador

  // Código (HTML, JS, CSS, manifest): REDE PRIMEIRO — garante que uma atualização aparece logo.
  // Sem internet, usa a cópia em cache.
  const isCode = req.mode === 'navigate' || /\.(?:html|js|css|json)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (isCode) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          // cada página fica guardada com o próprio endereço (antes, qualquer página substituía o index.html em cache)
          if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (url.pathname.endsWith('/preencher.html') ? Response.error() : caches.match('./index.html'))))
    );
    return;
  }

  // Imagens e fontes: cache primeiro (rápido e offline), atualizando em segundo plano.
  event.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((cached) => {
        const network = fetch(req)
          .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
