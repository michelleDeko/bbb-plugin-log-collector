import { DisconnectDetector } from './disconnectDetector';
import { redactText } from './redact';

/**
 * Captures browser-level signals that matter for disconnect analysis:
 * network loss, uncaught JS errors and tab visibility (mobile browsers
 * throttle or kill connections of hidden tabs).
 */
export function installBrowserEventCapture(detector: DisconnectDetector): void {
  window.addEventListener('offline', () => {
    detector.record('network', true, 'Browser went offline (navigator.onLine=false)');
  });

  window.addEventListener('online', () => {
    detector.record('network', false, 'Browser back online (navigator.onLine=true)');
  });

  window.addEventListener('error', (event: ErrorEvent) => {
    const location = event.filename ? ` at ${event.filename}:${event.lineno}` : '';
    detector.record('js-error', false, redactText(`Uncaught error: ${event.message}${location}`));
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    let reason = 'unknown';
    try {
      reason = event.reason instanceof Error
        ? `${event.reason.name}: ${event.reason.message}`
        : String(event.reason);
    } catch (e) {
      // keep 'unknown'
    }
    detector.record('js-error', false, redactText(`Unhandled promise rejection: ${reason}`));
  });

  document.addEventListener('visibilitychange', () => {
    detector.record('context', false, `Tab visibility changed to "${document.visibilityState}"`);
  });
}
