// My Office Bot service worker.
// Makes the app installable as a standalone app, and shows phone notifications for new leads (D63).
// No fetch handler on purpose: every request goes to the network, so leads are never served stale.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// A new lead (or a test) from the server: { title, body, url, tag }.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "My Office Bot", {
      body: data.body || "You have a new lead.",
      icon: "/icons/icon-192.png?v=2",
      badge: "/icons/icon-192.png?v=2",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/app" },
    }),
  );
});

// Tapping the notification opens that lead: reuse an open My Office Bot window if there is one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/app", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          if ("navigate" in client) await client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
