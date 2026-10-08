export const PLUGIN_NAME = 'BbbPluginLogCollection';
export const PLUGIN_VERSION = '0.1.6';

export const DEFAULT_MAX_LOG_ENTRIES = 10000;
export const MAX_EVENT_ENTRIES = 1000;

// Minimum time between two disconnect panels, so a flapping connection
// does not re-open the panel on every retry.
export const ALERT_DEBOUNCE_MS = 30_000;

// After the user dismissed the panel (or downloaded the logs), a connection
// that stays bad keeps producing alerts - stay quiet for this long.
export const ALERT_SUPPRESS_AFTER_DISMISS_MS = 5 * 60_000;

// The bigbluebutton-html5 client logs through browser-bunyan onto the console,
// each record carrying a `logCode`. The codes below are taken from the BBB
// source (connection-manager, audio-manager, SIP.js/SFU/LiveKit bridges) and
// mark situations where BBB itself noticed a connection problem.

// The whole meeting connection (GraphQL websocket) dropped or errored.
export const MEETING_DISCONNECT_CODES: string[] = [
  'connection_terminated',
  'connection_error',
  'graphql_websocket_closed',
  'graphql_server_closed_connection',
  'graphql_network_error',
];

// The audio/media connection dropped, failed or is reconnecting.
// BBB 4.0 removed the SIP.js audio bridge (LiveKit is the default transport);
// the sip_js/sipjs codes are kept so this list also matches on 3.x servers.
export const AUDIO_DISCONNECT_CODES: string[] = [
  'audio_failure',
  'audio_join_failure',
  'audio_reconnecting',
  'sfuaudio_error',
  'sfuaudio_error_try_to_reconnect',
  'sfuaudio_reconnect_failed',
  'sip_js_session_ua_disconnected',
  'sip_js_session_ua_reconnecting',
  'sip_js_session_ua_reconnection_attempt',
  'sipjs_ice_failed_before',
  'sipjs_ice_failed_after',
  'sipjs_ice_closed',
  'livekit_audio_fatal_publish_error_reconnect',
  'livekit_audio_subscription_failed',
  // LiveKit primary room = the media transport in BBB 4.0 (audio, webcams,
  // screen). BBB 4.0.0-rc.1 and later log it with the "livekit_primary"
  // prefix (base-room component). Secondary rooms (breakout listening) log
  // as livekit_secondary_<room> and are only kept as context.
  'livekit_primary_disconnected',
  'livekit_primary_error',
  'livekit_primary_reconnect_stalled',
  'livekit_primary_reconnect_exhausted',
  'livekit_primary_fatal_error_reconnect',
  'livekit_primary_fatal_error_disconnect_failed',
];

// A room disconnect the user asked for (leaving) is not an incident. BBB
// logs LiveKit's numeric DisconnectReason, where 1 = CLIENT_INITIATED.
export const NORMAL_LEAVE_PATTERN = /reason=(1|CLIENT_INITIATED)\b/i;

// Useful timeline context, but not an incident by itself
// (normal joins/leaves, recoveries, connection-quality ratings).
export const CONTEXT_CODES: string[] = [
  'audio_joining',
  'audio_joined',
  'audio_ended',
  'sip_js_call_terminated',
  'sip_js_session_terminated',
  'sip_js_session_ua_connected',
  'sip_js_session_ua_reconnected',
  'sip_js_ice_connection_success',
  'sip_js_ice_connection_success_after_success',
  'audiocontrols_leave_audio',
  'livekit_audio_published',
  'livekit_audio_exit',
  'livekit_primary_connected',
  'livekit_primary_signal_connected',
  'livekit_primary_conn_state',
  'livekit_primary_prepare_error',
];

export const QUALITY_CODES: string[] = [
  'stats_connection_state',
  'stats_livekit_conn_state',
  'stats_packet_loss_state',
  'stats_rtt_state',
  'stats_ping_state',
];

// IMPORTANT: in production the BBB client logs through browser-bunyan's
// ConsoleFormattedStream, which renders the message text but does NOT pass
// the logCode object to the console (verified empirically against
// browser-bunyan 1.8.0; the logCode-carrying local ConsoleStream is only
// active with DETAILED_LOGS in development). The logCode lists above
// therefore only match in dev - production detection relies on these
// message-text patterns, taken verbatim from the BBB client sources.
// Matched against warn/error lines only.
export interface AlertingMessageRule {
  pattern: RegExp;
  category: 'audio' | 'meeting' | 'quality';
}

export const ALERTING_MESSAGE_PATTERNS: AlertingMessageRule[] = [
  // connection-status: triggers BBB's own "A loss in your connection has
  // been detected" notification (stats_rtt_state and friends).
  { pattern: /Connection status changed to critical/i, category: 'quality' },
  // audio-manager / bridges
  { pattern: /Attempting to reconnect audio/i, category: 'audio' }, // audio_reconnecting
  { pattern: /Audio error|Error enabling audio/i, category: 'audio' }, // audio_failure / audio_join_failure
  { pattern: /SFU audio (failed|reconnect failed)/i, category: 'audio' }, // sfuaudio_*
  { pattern: /ICE (connection|negotiation) failed/i, category: 'audio' }, // sipjs_ice_failed_*
  { pattern: /User agent (disconnected|failed to (re)?connect)/i, category: 'audio' }, // sip_js_session_ua_*
  { pattern: /LiveKit: fatal audio publish error/i, category: 'audio' }, // livekit_audio_fatal_publish_error_reconnect
  { pattern: /LiveKit: failed to subscribe to microphone/i, category: 'audio' }, // livekit_audio_subscription_failed
  // LiveKit primary room = the media transport in BBB 4.0. A disconnect with
  // reason=1/CLIENT_INITIATED is the user leaving, not an incident.
  { pattern: /livekit_primary: room disconnected, reason=(?!(1|CLIENT_INITIATED)\b)/i, category: 'audio' }, // livekit_primary_disconnected
  { pattern: /livekit_primary: room error/i, category: 'audio' }, // livekit_primary_error
  { pattern: /livekit_primary: room stalled/i, category: 'audio' }, // livekit_primary_reconnect_stalled
  { pattern: /livekit_primary: reconnect attempts exhausted/i, category: 'audio' }, // livekit_primary_reconnect_exhausted
  { pattern: /livekit_primary: fatal error/i, category: 'audio' }, // livekit_primary_fatal_error_reconnect
  { pattern: /livekit_primary: failed to disconnect during fatal error recovery/i, category: 'audio' }, // livekit_primary_fatal_error_disconnect_failed
  // connection-manager (GraphQL websocket)
  { pattern: /Connection terminated|Connection error \(/i, category: 'meeting' }, // connection_terminated / connection_error
  { pattern: /Graphql Server closed the connection/i, category: 'meeting' }, // graphql_server_closed_connection
  { pattern: /WebSocket closed with code 1006/i, category: 'meeting' }, // graphql_websocket_closed, abnormal
];

// Fallback for BBB versions with changed/unknown logCodes: warn/error console
// lines matching this are still recorded as (non-alerting) events.
export const FALLBACK_DISCONNECT_PATTERN = /\b(disconnect(ed|ing)?|connection (lost|closed|terminated|failed)|ice (connection )?(failed|closed)|reconnect(ing|ion)?)\b/i;
