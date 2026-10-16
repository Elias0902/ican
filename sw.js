// ican service worker: the app opens and works without internet.
// - App shell (HTML/JS/CSS/fonts/icons): cached, network-first for pages
// - Images (covers, artist photos): cache-first, so they show offline
// - Audio is NOT cached here: downloads live in IndexedDB inside the app
const VERSION = 'ican-v3'
const SHELL = `${VERSION}-shell`
const IMAGES = `${VERSION}-img`
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable.png']
const MAX_IMAGES = 400

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

async function trim(cacheName, max) {
  const c = await caches.open(cacheName)
  const keys = await c.keys()
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i])
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || req.headers.has('range')) return
  const url = new URL(req.url)

  // Pages: network first, fall back to the cached app
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html'))
    )
    return
  }

  // Images from anywhere: cache first
  if (req.destination === 'image') {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req)
            .then((res) => {
              const copy = res.clone()
              caches.open(IMAGES).then((c) => c.put(req, copy).then(() => trim(IMAGES, MAX_IMAGES)))
              return res
            })
            .catch(() => Response.error())
      )
    )
    return
  }

  // Same-origin assets (hashed JS/CSS/fonts): cache first
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(SHELL).then((c) => c.put(req, copy))
            }
            return res
          })
      )
    )
  }
  // Everything else (APIs, audio streams) goes straight to the network
})
