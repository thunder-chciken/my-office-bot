// My Office Bot service worker.
// Makes the app installable as a standalone app; push-notification handlers will live here later.
// No fetch handler on purpose: every request goes to the network, so leads are never served stale.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
