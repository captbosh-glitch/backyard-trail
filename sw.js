// Backyard & Trail service worker: keeps the app and its illustrations on the phone so saved packs work
// without signal. Photos are cached as they're viewed, and for every place saved for offline.
const VERSION = 'bt-shell-v1';
const MEDIA = 'bt-media-v1';
const SHELL = [
  './', 'index.html', 'app.css', 'app.js', 'data.js', 'manifest.webmanifest',
  'icons/favicon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'art/bear.png',  'art/berries.png',  'art/cactus.png',  'art/cougar.png',  'art/coyote.png',  'art/elk.png',  'art/gator.png',  'art/hog.png',  'art/lizard.png',  'art/moose.png',  'art/mushroom.png',  'art/plant.png',  'art/scorpion.png',  'art/snake.png',  'art/spider.png',  'art/spores.png',  'art/tick.png',  'art/toad.png',  'art/wasp.png',  'art/wolf.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== MEDIA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // sightings, place lookups and map tiles always come fresh; the app falls back to saved packs itself
  if (/inaturalist|openstreetmap|zippopotam|tile\.openstreetmap/.test(url.host)) return;
  if (url.origin === location.origin && /\/(photos|art)\//.test(url.pathname)) {
    e.respondWith(caches.open(MEDIA).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  // app files and fonts: answer from cache at once, refresh in the background
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
    const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
