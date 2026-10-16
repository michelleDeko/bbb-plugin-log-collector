import {
  ALERT_CONFIRM_DELAY_MS,
  ALERT_DEBOUNCE_MS,
  ALERTING_MESSAGE_PATTERNS,
  AUDIO_DISCONNECT_CODES,
  CONTEXT_CODES,
  FALLBACK_DISCONNECT_PATTERN,
  MEETING_DISCONNECT_CODES,
  NORMAL_LEAVE_PATTERN,
  QUALITY_CODES,
  SESSION_END_RULES,
} from '../core/constants';
import { DisconnectEvent, EventCategory, LogEntry } from '../core/types';
import { RingBuffer } from './logBuffer';

export type AlertListener = (event: DisconnectEvent) => void;

export interface SessionEnd {
  ts: string;
  reason: string;
}

/**
 * Classifies captured log lines and low-level browser signals into a
 * timeline of connection events, and notifies the UI (debounced) whenever
 * an event indicates a real disconnect.
 *
 * Alerts are held for ALERT_CONFIRM_DELAY_MS: a deliberate session end
 * (meeting ended, user removed, joined again elsewhere) tears the
 * connections down as well, and its signal may arrive a moment after the
 * disconnect it causes. Such alerts are dropped and marked as expected.
 */
export class DisconnectDetector {
  private listeners: AlertListener[] = [];

  private lastAlertAt = 0;

  private held: DisconnectEvent[] = [];

  private holdTimer: ReturnType<typeof setTimeout> | undefined;

  private ended: SessionEnd | undefined;

  constructor(
    private events: RingBuffer<DisconnectEvent>,
    private confirmDelayMs = ALERT_CONFIRM_DELAY_MS,
  ) {}

  onAlert(listener: AlertListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** The deliberate session end seen so far, if any. */
  get sessionEnd(): SessionEnd | undefined {
    return this.ended;
  }

  record(category: EventCategory, alerting: boolean, detail: string, code?: string): void {
    const event: DisconnectEvent = {
      ts: new Date().toISOString(),
      category,
      alerting,
      code,
      detail,
    };
    if (alerting && this.ended) {
      event.alerting = false;
      event.expected = `after the session ended: ${this.ended.reason}`;
    }
    this.events.push(event);

    if (event.alerting) {
      this.held.push(event);
      if (this.holdTimer === undefined) {
        this.holdTimer = setTimeout(() => this.releaseHeld(), this.confirmDelayMs);
      }
    }
  }

  /**
   * The session ended on purpose: drop the alerts still on hold and keep
   * every later disconnect from alerting, until the user is back in a
   * meeting (markSessionActive).
   */
  markSessionEnded(reason: string): void {
    if (this.ended) return;
    this.ended = { ts: new Date().toISOString(), reason };

    if (this.holdTimer !== undefined) {
      clearTimeout(this.holdTimer);
      this.holdTimer = undefined;
    }
    this.held.forEach((event) => {
      event.alerting = false;
      event.expected = `the session ended: ${reason}`;
    });
    this.held = [];

    this.record('context', false, `Session ended: ${reason} - later disconnects are expected`);
  }

  markSessionActive(): void {
    if (!this.ended) return;
    this.ended = undefined;
    this.record('context', false, 'User is in the meeting again');
  }

  /** Feed one captured console entry through the logCode/text classifiers. */
  handleLogEntry(entry: LogEntry): void {
    const { logCode, text, level } = entry;

    for (let i = 0; i < SESSION_END_RULES.length; i += 1) {
      const rule = SESSION_END_RULES[i];
      if (rule.pattern.test(text)) {
        this.record(rule.category, false, text, logCode);
        this.markSessionEnded(rule.reason);
        return;
      }
    }

    if (logCode) {
      if (MEETING_DISCONNECT_CODES.indexOf(logCode) !== -1) {
        this.record('meeting', true, text, logCode);
        return;
      }
      if (AUDIO_DISCONNECT_CODES.indexOf(logCode) !== -1) {
        // e.g. a LiveKit room disconnect with reason CLIENT_INITIATED is the
        // client's own doing, not an incident.
        this.record('audio', !NORMAL_LEAVE_PATTERN.test(text), text, logCode);
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

  private releaseHeld(): void {
    this.holdTimer = undefined;
    const [first] = this.held;
    this.held = [];
    if (!first) return;

    const now = Date.now();
    if (now - this.lastAlertAt < ALERT_DEBOUNCE_MS) return;
    this.lastAlertAt = now;
    this.listeners.forEach((listener) => {
      try {
        listener(first);
      } catch (e) {
        // A broken listener must not take the capture pipeline down.
      }
    });
  }
}
