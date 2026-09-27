importScripts('./version.js');
const CACHE = 'bee-' + self.BEE_VERSION;
const ASSETS = ['./', './index.html', './styles.css', './tuning.js', './version.js', './game.js', './icon.svg', './manifest.webmanifest'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))); });
