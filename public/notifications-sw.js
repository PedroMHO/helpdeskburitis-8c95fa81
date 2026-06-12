// Notification service worker (NOT an app-shell/offline worker).
// Required so notifications work on mobile browsers (iOS/Android),
// where notifications must be shown via a service worker registration.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle clicks on notifications: focus an open tab or open the ticket.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ticketId = event.notification.data && event.notification.data.ticketId;
  const targetUrl = ticketId ? `/tickets/${ticketId}` : "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && ticketId) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // ignore cross-origin navigation errors
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
