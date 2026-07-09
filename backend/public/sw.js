// Service Worker — advmachado.adv.br
// v3: API nunca é cacheada; assets são network-first (cache apenas como fallback offline)
const CACHE = 'advmachado-v3';
const PRECACHE = [
  '/',
  '/styles.css',
  '/logo.png',
  '/favicon.png',
  '/direito-medico-saude.html',
  '/inventarios.html',
  '/quem-somos.html',
  '/blog.html',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // ─── API: NUNCA interceptar — sempre direto na rede ───────────────────────
  // Cachear /api causava dados desatualizados em todo o Veredo
  // (listas de clientes, templates, documentos não atualizavam sem Ctrl+Shift+R)
  if (url.pathname.startsWith('/api/')) return;

  // ─── Assets do app (JS/CSS do Vite): network-first ────────────────────────
  // Garante que após cada deploy a versão nova carrega imediatamente.
  // O cache só é usado se estiver offline.
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
