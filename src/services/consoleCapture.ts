import { LogEntry, LogLevel } from '../core/types';
import { extractLogCode, formatConsoleArgs } from './serialize';
import { redactText } from './redact';

const LEVELS: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug', 'trace'];

/**
 * Wraps the console methods so every line — including everything the
 * bigbluebutton-html5 client logs through browser-bunyan — lands in the
 * capture buffer. The original method always runs first and capture failures
 * are swallowed: the plugin must never break the client's own logging.
 */
export function installConsoleCapture(onEntry: (entry: LogEntry) => void): void {
  LEVELS.forEach((level) => {
    const original = console[level] ? console[level].bind(console) : console.log.bind(console);

    console[level] = (...args: unknown[]): void => {
      original(...args);
      try {
        onEntry({
          ts: new Date().toISOString(),
          level,
          text: redactText(formatConsoleArgs(args)),
          logCode: extractLogCode(args),
        });
      } catch (e) {
        // Never propagate capture errors into the caller.
      }
    };
  });
}
