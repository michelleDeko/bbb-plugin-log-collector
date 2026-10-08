import { strToU8, zipSync } from 'fflate';
import { PLUGIN_NAME, PLUGIN_VERSION } from '../core/constants';
import { SessionMeta } from '../core/types';
import { CaptureCore } from './capture';
import { sanitizeUrl } from './redact';

interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

function buildSessionInfo(core: CaptureCore, meta: SessionMeta): string {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return JSON.stringify({
    plugin: { name: PLUGIN_NAME, version: PLUGIN_VERSION },
    capture: {
      startedAt: core.startedAt,
      exportedAt: new Date().toISOString(),
      logEntries: core.logs.size,
      droppedLogEntries: core.logs.droppedCount,
      connectionEvents: core.events.size,
    },
    meeting: {
      meetingId: meta.meetingId,
      meetingName: meta.meetingName,
    },
    user: {
      userId: meta.userId,
      name: meta.userName,
      role: meta.userRole,
    },
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      online: navigator.onLine,
      visibility: document.visibilityState,
      screen: { width: window.screen.width, height: window.screen.height },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      connection: connection ? {
        effectiveType: connection.effectiveType,
        downlinkMbps: connection.downlink,
        rttMs: connection.rtt,
      } : undefined,
    },
    page: sanitizeUrl(window.location.href),
  }, null, 2);
}

function buildConsoleLog(core: CaptureCore): string {
  const header = core.logs.droppedCount > 0
    ? `# ${core.logs.droppedCount} older entries were dropped (buffer limit)\n`
    : '';
  const lines = core.logs.toArray().map((entry) => (
    `[${entry.ts}] ${entry.level.toUpperCase().padStart(5)} ${entry.text}`
  ));
  return `${header}${lines.join('\n')}\n`;
}

function buildEventsNdjson(core: CaptureCore): string {
  return `${core.events.toArray().map((event) => JSON.stringify(event)).join('\n')}\n`;
}

function buildSummary(core: CaptureCore): string {
  const events = core.events.toArray();
  const alerting = events.filter((event) => event.alerting);

  const lines: string[] = [
    'BigBlueButton client log collection — summary',
    '==============================================',
    '',
    `Capture window: ${core.startedAt} .. ${new Date().toISOString()}`,
    `Console entries: ${core.logs.size} (dropped: ${core.logs.droppedCount})`,
    `Connection events: ${events.length}, of which disconnect indications: ${alerting.length}`,
    '',
  ];

  if (alerting.length === 0) {
    lines.push('No disconnect was detected by the client during the capture window.');
  } else {
    lines.push('Detected disconnect indications (see events.ndjson for the full timeline):');
    alerting.forEach((event) => {
      lines.push(`  [${event.ts}] ${event.category}${event.code ? ` (${event.code})` : ''}: ${event.detail}`);
    });
  }
  lines.push('');
  lines.push('Files in this archive:');
  lines.push('  browser-console.log  full captured browser console output');
  lines.push('  events.ndjson        classified connection/error events, one JSON per line');
  lines.push('  session-info.json    browser, meeting and capture metadata');
  lines.push('');
  lines.push('Note: secrets are redacted and other participants\' names/ids are');
  lines.push('pseudonymized on a best-effort basis before anything is stored.');
  return `${lines.join('\n')}\n`;
}

/** Build the diagnostics ZIP fully client-side and hand it to the browser as a download. */
export function exportLogsAsZip(core: CaptureCore, meta: SessionMeta): void {
  const zipped = zipSync({
    'browser-console.log': strToU8(buildConsoleLog(core)),
    'events.ndjson': strToU8(buildEventsNdjson(core)),
    'session-info.json': strToU8(buildSessionInfo(core, meta)),
    'summary.txt': strToU8(buildSummary(core)),
  }, { level: 6 });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const blob = new Blob([zipped as unknown as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `bbb-client-logs_${stamp}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
