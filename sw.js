// ORION Service Worker — Offline & PWA Cache
const CACHE_NAME = "orion-v1.0.0";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/orion.css",
  "/js/orion.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  // Tailwind CDN — cacheado en primera carga
  "https://cdn.tailwindcss.com",
];

// Instalación — precachea assets estáticos
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[ORION SW] Precaching assets...");
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[ORION SW] Some assets failed to cache:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activación — limpia caches viejos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch — estrategia: Cache First para estáticos, Network Only para API
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls: siempre red (nunca cachear respuestas IA)
  if (url.pathname.startsWith("/api/") || url.hostname.includes("vercel.app")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // CDN externas (Tailwind, Google Fonts): Network first, caché como fallback
  if (url.hostname !== self.location.hostname) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Assets locales: Cache First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      });
    })
  );
});

// Mensaje del cliente para forzar actualización
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
