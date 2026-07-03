// Service worker do Meridian — cacheia SOMENTE o shell estático (mesma origem).
// Nunca intercepta chamadas de API (Anthropic, football-data, ESPN, allorigins etc.):
// para essas, o navegador segue o fluxo normal de rede, sem passar pelo SW.
//
// Estratégia:
//  - Navegação / HTML  → NETWORK-FIRST: sempre tenta a rede primeiro (pega a versão
//    mais nova quando o servidor está no ar); cai no cache só quando offline.
//    Isso evita o app ficar "preso" numa versão antiga após uma atualização.
//  - Demais assets (ícones, manifest, fontes locais) → STALE-WHILE-REVALIDATE:
//    responde do cache na hora e atualiza o cache em segundo plano.
const CACHE_VERSION = 'meridian-v4';
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
    ).then(() => self.clients.claim())
  );
});

function isNavigation(req) {
  return req.mode === 'navigate' ||
    (req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // APIs/fontes externas: passa direto

  // NETWORK-FIRST para navegação/HTML → sempre pega a versão nova quando online.
  if (isNavigation(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // STALE-WHILE-REVALIDATE para os demais assets do shell.
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
