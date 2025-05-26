const CACHE_NAME = "wtmap-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/compass.html",
  "/css/styles.css",
  "/js/map.js",
  "/js/streetview.js",
  "/js/compass.js",
  "/assets/rabbit.png",
  // Add other assets as needed
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet.markercluster/dist/MarkerCluster.css",
  "https://unpkg.com/leaflet.markercluster/dist/MarkerCluster.Default.css",
  "https://unpkg.com/leaflet.markercluster/dist/leaflet.markercluster.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
  );
});

self.addEventListener("fetch", (event) => {
  // For map tiles, use network first, fallback to cache
  if (event.request.url.includes("tile.openstreetmap.org")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  // For other assets, use cache first
  event.respondWith(
    caches
      .match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
