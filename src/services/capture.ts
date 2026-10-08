import { DEFAULT_MAX_LOG_ENTRIES, MAX_EVENT_ENTRIES } from '../core/constants';
import { DisconnectEvent, LogEntry } from '../core/types';
import { installBrowserEventCapture } from './browserEvents';
import { installConsoleCapture } from './consoleCapture';
import { DisconnectDetector } from './disconnectDetector';
import { RingBuffer } from './logBuffer';
import { installWebRtcMonitor } from './webrtcMonitor';
import { installWebSocketMonitor } from './websocketMonitor';

export interface CaptureCore {
  startedAt: string;
  logs: RingBuffer<LogEntry>;
  events: RingBuffer<DisconnectEvent>;
  detector: DisconnectDetector;
}

declare global {
  interface Window {
    __BBB_LOG_COLLECTION_CORE__?: CaptureCore;
  }
}

/**
 * Installs all capture hooks exactly once per page and returns the shared
 * core. Called at module-evaluation time from index.tsx so capturing starts
 * the moment the plugin bundle is loaded - before the React tree mounts -
 * and survives plugin re-mounts without double-patching the console.
 */
export function getCaptureCore(): CaptureCore {
  if (window.__BBB_LOG_COLLECTION_CORE__) {
    return window.__BBB_LOG_COLLECTION_CORE__;
  }

  const logs = new RingBuffer<LogEntry>(DEFAULT_MAX_LOG_ENTRIES);
  const events = new RingBuffer<DisconnectEvent>(MAX_EVENT_ENTRIES);
  const detector = new DisconnectDetector(events);

  installConsoleCapture((entry) => {
    logs.push(entry);
    detector.handleLogEntry(entry);
  });
  installBrowserEventCapture(detector);
  installWebRtcMonitor(detector);
  installWebSocketMonitor(detector);

  const core: CaptureCore = {
    startedAt: new Date().toISOString(),
    logs,
    events,
    detector,
  };
  window.__BBB_LOG_COLLECTION_CORE__ = core;
  return core;
}
