import {
  ALERT_DEBOUNCE_MS,
  ALERTING_MESSAGE_PATTERNS,
  AUDIO_DISCONNECT_CODES,
  CONTEXT_CODES,
  FALLBACK_DISCONNECT_PATTERN,
  MEETING_DISCONNECT_CODES,
  QUALITY_CODES,
} from '../core/constants';
import { DisconnectEvent, EventCategory, LogEntry } from '../core/types';
import { RingBuffer } from './logBuffer';

export type AlertListener = (event: DisconnectEvent) => void;

/**
 * Classifies captured log lines and low-level browser signals into a
 * timeline of connection events, and notifies the UI (debounced) whenever
 * an event indicates a real disconnect.
 */
export class DisconnectDetector {
  private listeners: AlertListener[] = [];

  private lastAlertAt = 0;

  constructor(private events: RingBuffer<DisconnectEvent>) {}

  onAlert(listener: AlertListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  record(category: EventCategory, alerting: boolean, detail: string, code?: string): void {
    const event: DisconnectEvent = {
      ts: new Date().toISOString(),
      category,
      alerting,
      code,
      detail,
    };
    this.events.push(event);

    if (alerting) {
      const now = Date.now();
      if (now - this.lastAlertAt >= ALERT_DEBOUNCE_MS) {
        this.lastAlertAt = now;
        this.listeners.forEach((listener) => {
          try {
            listener(event);
          } catch (e) {
            // A broken listener must not take the capture pipeline down.
          }
        });
      }
    }
  }

  /** Feed one captured console entry through the logCode/text classifiers. */
  handleLogEntry(entry: LogEntry): void {
    const { logCode, text, level } = entry;

    if (logCode) {
      if (MEETING_DISCONNECT_CODES.indexOf(logCode) !== -1) {
        this.record('meeting', true, text, logCode);
        return;
      }
      if (AUDIO_DISCONNECT_CODES.indexOf(logCode) !== -1) {
        this.record('audio', true, text, logCode);
        return;
      }
      if (CONTEXT_CODES.indexOf(logCode) !== -1) {
        this.record('context', false, text, logCode);
        return;
      }
      if (QUALITY_CODES.indexOf(logCode) !== -1) {
        // Quality ratings are only interesting when BBB flags them. A
        // "critical" rating is what makes BBB tell the user "A loss in your
        // connection has been detected", so it alerts like a disconnect.
        if (level === 'warn' || level === 'error') {
          this.record('quality', /critical/i.test(text), text, logCode);
        }
        return;
      }
    }

    if (level !== 'warn' && level !== 'error') return;

    // Primary production path: BBB's ConsoleFormattedStream does not pass the
    // logCode object to the console, so match the rendered message text
    // against patterns taken from the BBB client sources.
    for (let i = 0; i < ALERTING_MESSAGE_PATTERNS.length; i += 1) {
      const rule = ALERTING_MESSAGE_PATTERNS[i];
      if (rule.pattern.test(text)) {
        this.record(rule.category, true, text, logCode);
        return;
      }
    }

    // Fallback for unknown/changed messages in future BBB versions.
    if (FALLBACK_DISCONNECT_PATTERN.test(text)) {
      this.record('context', false, text, logCode);
    }
  }
}
