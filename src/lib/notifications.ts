// Notifications support for desktop AND mobile (iOS/Android).
//
// On mobile browsers the legacy `new Notification()` constructor is not
// available — notifications must be shown via a service worker
// registration (`registration.showNotification`). On iOS this only works
// when the app is installed to the Home Screen (standalone PWA).
// Icon uses a high-resolution app icon.

const APP_ICON = "/icon-192.png";
const SW_URL = "/notifications-sw.js";

let swRegistration: ServiceWorkerRegistration | null = null;

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Register the notification service worker (needed for mobile). */
export async function registerNotificationServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    swRegistration =
      (await navigator.serviceWorker.getRegistration(SW_URL)) ??
      (await navigator.serviceWorker.register(SW_URL));
    await navigator.serviceWorker.ready;
  } catch {
    // ignore — fall back to legacy Notification API
  }
}

/** Ask for notification permission once (safe to call repeatedly). */
export async function ensureNotificationPermission(): Promise<void> {
  if (!notificationsSupported()) return;
  await registerNotificationServiceWorker();
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      // ignore — user dismissed
    }
  }
}

/**
 * Show a native notification. Prefers the service worker (works on mobile),
 * falling back to the legacy constructor on desktop.
 */
export async function showNativeNotification(opts: {
  title: string;
  body?: string;
  ticketId?: string | null;
}): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== "granted") return;

  const title = "HelpDesk Buritis:";
  const options: NotificationOptions = {
    body: opts.body ? `${opts.title}\n${opts.body}` : opts.title,
    icon: APP_ICON,
    badge: APP_ICON,
    tag: opts.ticketId ?? undefined,
    data: { ticketId: opts.ticketId ?? null },
  };

  // Mobile path: use the service worker registration.
  try {
    const reg =
      swRegistration ??
      (typeof navigator !== "undefined" && "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration(SW_URL)
        : null);
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // fall through to legacy path
  }

  // Desktop fallback.
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      if (opts.ticketId) window.location.href = `/tickets/${opts.ticketId}`;
      n.close();
    };
  } catch {
    // notifications unavailable in this context
  }
}
