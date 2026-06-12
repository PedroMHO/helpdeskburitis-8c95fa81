// Native browser notifications (Web Notifications API).
// Icon uses the official app favicon.

const APP_ICON = "/favicon.ico";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Ask for notification permission once (safe to call repeatedly). */
export async function ensureNotificationPermission(): Promise<void> {
  if (!notificationsSupported()) return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      // ignore — user dismissed
    }
  }
}

/**
 * Show a native notification. `onClickPath` is stored so a click can
 * redirect the logged-in user straight to the ticket details.
 */
export function showNativeNotification(opts: {
  title: string;
  body?: string;
  ticketId?: string | null;
}) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  const n = new Notification("HelpDesk Buritis:", {
    body: opts.body ? `${opts.title}\n${opts.body}` : opts.title,
    icon: APP_ICON,
    badge: APP_ICON,
    tag: opts.ticketId ?? undefined,
  });
  n.onclick = () => {
    window.focus();
    if (opts.ticketId) {
      window.location.href = `/tickets/${opts.ticketId}`;
    }
    n.close();
  };
}
