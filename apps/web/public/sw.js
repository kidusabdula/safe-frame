/* SafeFrame service worker — hand-rolled, cache-first for the app shell and
 * model runtime assets so the app works fully offline after one online scan.
 *
 * Caching layers:
 *  - SHELL: navigations + same-origin static assets (network-first for HTML
 *    so updates land; cache-first for hashed /_next/ assets and /tfjs-wasm/).
 *  - Tier-1 model: bundled inside hashed JS chunks → covered by SHELL.
 *  - Tier-2 model (Hugging Face): Transformers.js persists it in its own
 *    Cache API bucket ("transformers-cache"), so this worker deliberately
 *    does not double-cache cross-origin model files.
 */
const SHELL_CACHE = "safeframe-shell-v4";

// Clean URLs only. `cache.addAll` rejects the whole install if any entry
// fails, and Vercel's Next.js preset serves the export at clean URLs only:
// `/detect.html` is a 404 there, which used to fail the install outright.
const PRECACHE = [
  "/",
  "/detect",
  "/architecture",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("safeframe-") && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin: leave alone (Tier-2 model caching is Transformers.js's
  // job; user-provided video URLs must never be cached).
  if (url.origin !== self.location.origin) return;

  // Never cache blob/media-range traffic.
  if (request.headers.has("range")) return;

  if (request.mode === "navigate") {
    // Network-first HTML: fresh when online, cached shell when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit ?? caches.match("/detect"))
            .then((hit) => hit ?? Response.error()),
        ),
    );
    return;
  }

  // Hashed build assets + wasm + icons: cache-first (immutable by name).
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
