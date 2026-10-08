export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  text: string;
  logCode?: string;
}

export type EventCategory =
  | 'audio'
  | 'meeting'
  | 'webrtc'
  | 'websocket'
  | 'network'
  | 'js-error'
  | 'quality'
  | 'context';

export interface DisconnectEvent {
  ts: string;
  category: EventCategory;
  // Alerting events indicate a disconnect the user should be told about;
  // non-alerting ones are context for the timeline (joins, quality warnings, ...).
  alerting: boolean;
  code?: string;
  detail: string;
}

export interface SessionMeta {
  meetingId?: string;
  meetingName?: string;
  userId?: string;
  userName?: string;
  userRole?: string;
}

export interface PluginSettingsShape {
  maxLogEntries?: number;
  showDisconnectPanel?: boolean;
}

export interface PluginRootProps {
  pluginUuid: string;
  pluginName: string;
}
