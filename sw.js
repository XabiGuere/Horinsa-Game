// HORINSA — service worker: guarda el juego para que cargue rápido y funcione sin conexión
// Archivos del juego: primero la red (siempre la última versión) y, sin conexión, la copia guardada.
// Three.js desde el CDN: versión fija, así que primero la copia guardada.
const CACHE = 'horinsa-v2';
const CORE = ['./', 'index.html', 'juego.js', 'render3d.js', 'minijuego.js', 'pala.js', 'canaleta.js', 'datos/lanzarote-osm.js', 'datos/relieve.js',
  'manifest.webmanifest', 'icono-192.png', 'icono-512.png', 'apple-touch-icon.png', 'favicon.png'];
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';
const LIBS = ['build/three.module.js', 'examples/jsm/controls/MapControls.js', 'examples/jsm/controls/OrbitControls.js', 'examples/jsm/utils/BufferGeometryUtils.js'].map(p => CDN + p);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(CORE);
    await Promise.all(LIBS.map(u => c.add(u).catch(() => { })));   // si alguna falla, se guardará al usarla
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.href.startsWith(CDN)) {        // librería: copia guardada primero
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // juego: red primero, guardando la copia ('no-cache' pregunta al servidor si hay versión nueva; así las actualizaciones se ven al momento)
  e.respondWith(fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
