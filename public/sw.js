const CACHE_NAME = "life-sync-cache-v2";
const CORE_PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];
const STATIC_DESTINATIONS = new Set([
  "script",
  "style",
  "image",
  "font",
  "manifest",
]);
const API_PATH_PREFIXES = ["/api/", "/auth/"];

const resolveToScopeUrl = (rawPath) => {
  try {
    return new URL(rawPath, self.registration.scope).toString();
  } catch {
    return null;
  }
};

const extractHashedAssetUrls = async () => {
  try {
    const response = await fetch("./index.html", { cache: "no-store" });
    if (!response.ok) return [];

    const html = await response.text();
    const assetRefs = new Set();
    const refRegex = /(?:src|href)=["']([^"']+)["']/g;
    let match = refRegex.exec(html);

    while (match) {
      const candidate = match[1];
      if (
        candidate &&
        !candidate.startsWith("http") &&
        (candidate.includes("/assets/") || candidate.startsWith("./assets/"))
      ) {
        const resolved = resolveToScopeUrl(candidate);
        if (resolved) assetRefs.add(resolved);
      }
      match = refRegex.exec(html);
    }

    return [...assetRefs];
  } catch {
    return [];
  }
};

const cacheCoreAndBuildAssets = async () => {
  const cache = await caches.open(CACHE_NAME);

  await cache.addAll(CORE_PRECACHE_URLS);

  const hashedAssets = await extractHashedAssetUrls();
  await Promise.allSettled(
    hashedAssets.map((assetUrl) => cache.add(assetUrl)),
  );
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheCoreAndBuildAssets().then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (API_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return (
            (await cache.match(request)) ||
            (await cache.match("./index.html")) ||
            (await cache.match("./"))
          );
        }
      })(),
    );
    return;
  }

  // Cache only static assets to avoid storing future sensitive responses.
  if (!STATIC_DESTINATIONS.has(request.destination)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;

      try {
        const networkResponse = await fetch(request);
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === "basic"
        ) {
          cache.put(request, networkResponse.clone());
        }

        return networkResponse;
      } catch {
        if (request.destination === "image") {
          return cache.match("./icons/icon-192.png");
        }
        return Response.error();
      }
    })(),
  );
});
