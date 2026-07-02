// Service worker do WorldCup Agent — cacheia SOMENTE o shell estático (mesma origem).
// Nunca intercepta chamadas de API (Anthropic, football-data, ESPN, allorigins etc.):
// para essas, o navegador segue o fluxo normal de rede, sem passar pelo SW.
const CACHE_VERSION = 'wc-agent-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/wc-trophy.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Só cuida de GET, mesma origem, e apenas dos arquivos do shell — tudo mais
  // (fontes do Google, APIs externas) passa direto pelo navegador, sem cache.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
