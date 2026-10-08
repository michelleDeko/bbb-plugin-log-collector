import { DisconnectDetector } from './disconnectDetector';

/**
 * Observes every RTCPeerConnection the client creates (audio, webcams,
 * screenshare) and records connection/ICE state transitions. An ICE state of
 * "failed" is the most direct low-level evidence that the media transport -
 * i.e. the audio - dropped.
 *
 * The constructor is wrapped with a Proxy so the class identity, statics and
 * prototype chain stay untouched for the BBB client and its libraries.
 */
export function installWebRtcMonitor(detector: DisconnectDetector): void {
  if (typeof window.RTCPeerConnection !== 'function') return;

  const OriginalPeerConnection = window.RTCPeerConnection;
  let peerCounter = 0;

  window.RTCPeerConnection = new Proxy(OriginalPeerConnection, {
    construct(target, args: unknown[]): object {
      const pc = new (target as typeof RTCPeerConnection)(
        ...(args as ConstructorParameters<typeof RTCPeerConnection>),
      );
      peerCounter += 1;
      const peerId = `pc-${peerCounter}`;

      try {
        pc.addEventListener('connectionstatechange', () => {
          const alerting = pc.connectionState === 'failed';
          detector.record('webrtc', alerting, `${peerId}: connectionState changed to "${pc.connectionState}"`);
        });
        pc.addEventListener('iceconnectionstatechange', () => {
          const alerting = pc.iceConnectionState === 'failed';
          detector.record('webrtc', alerting, `${peerId}: iceConnectionState changed to "${pc.iceConnectionState}"`);
        });
      } catch (e) {
        // Monitoring is optional - never interfere with the connection itself.
      }

      return pc;
    },
  });
}
