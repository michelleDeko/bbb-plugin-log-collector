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

/** Quality of one media kind (audio or video) over the last sampling interval. */
export interface MediaQuality {
  inKbps?: number;
  inLossPct?: number;
  inJitterMs?: number;
  // Audio only: share of the played-out audio the browser had to fill in
  // because packets were missing or late - audible as dropouts.
  concealedPct?: number;
  outKbps?: number;
  // What the receiving side reports back about the media we send (RTCP).
  outLossPct?: number;
  outJitterMs?: number;
  outRttMs?: number;
}

/** One getStats() sample of one RTCPeerConnection. */
export interface WebRtcStatsSample {
  ts: string;
  pc: string;
  state: string;
  // Candidate types of the selected ICE pair, e.g. "relay udp (TURN over
  // tls) -> host" - never addresses or ports.
  path?: string;
  rttMs?: number;
  // The browser's estimate of the bandwidth available for sending; only
  // while video is sent (with audio alone the estimate is unbounded).
  availableOutKbps?: number;
  audio?: MediaQuality;
  video?: MediaQuality;
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
  collectWebRtcStats?: boolean;
}

export interface PluginRootProps {
  pluginUuid: string;
  pluginName: string;
}
