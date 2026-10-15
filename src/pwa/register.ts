/** Registers the service worker in production builds so the app works offline / installs as a PWA. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // Native (Capacitor) shells serve files locally; a service worker adds nothing there.
  if ((window as unknown as { Capacitor?: unknown }).Capacitor) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is best-effort */
    });
  });
}
