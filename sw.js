// Minimal service worker for å trigge "installer som app"-prompt i Chrome.
// Cacher ikke noe — appen er online-først.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
