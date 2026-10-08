import { DisconnectDetector } from './disconnectDetector';
import { sanitizeUrl } from './redact';

/**
 * Observes every WebSocket the client opens (GraphQL, SIP.js, SFU, LiveKit)
 * and records open/close/error transitions including the close code — the
 * close code (e.g. 1006 = abnormal closure) tells apart network drops from
 * deliberate shutdowns. URLs are stored without their query string, which
 * carries the BBB session token.
 */
export function installWebSocketMonitor(detector: DisconnectDetector): void {
  if (typeof window.WebSocket !== 'function') return;

  const OriginalWebSocket = window.WebSocket;
  let socketCounter = 0;

  window.WebSocket = new Proxy(OriginalWebSocket, {
    construct(target, args: unknown[]): object {
      const ws = new (target as typeof WebSocket)(
        ...(args as ConstructorParameters<typeof WebSocket>),
      );
      socketCounter += 1;
      const socketId = `ws-${socketCounter}`;
      const safeUrl = sanitizeUrl(String(args[0]));

      try {
        ws.addEventListener('open', () => {
          detector.record('websocket', false, `${socketId}: opened ${safeUrl}`);
        });
        ws.addEventListener('close', (event: CloseEvent) => {
          // 1006 = abnormal closure without a close frame: the classic
          // symptom of a dropped network connection.
          const alerting = event.code === 1006;
          detector.record(
            'websocket',
            alerting,
            `${socketId}: closed ${safeUrl} (code=${event.code}, wasClean=${event.wasClean})`,
          );
        });
        ws.addEventListener('error', () => {
          detector.record('websocket', false, `${socketId}: error on ${safeUrl}`);
        });
      } catch (e) {
        // Monitoring is optional — never interfere with the socket itself.
      }

      return ws;
    },
  });
}
