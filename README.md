# BBB Plugin: Log Collection

> **Versions:** 0.1.x (this version) targets BigBlueButton 4.0.0-rc.5 or
> newer (plugin SDK 1.0.0-beta.3) and additionally detects LiveKit room
> disconnects; 0.0.x targets BigBlueButton 3.x (plugin SDK 0.0.99).

A BigBlueButton HTML5 plugin that continuously captures client-side logs and
connection events, and lets users download them as a ZIP archive - built to
diagnose "I was disconnected from audio for no reason" reports.

## What it does

- **Automatic capture (always on):** from the moment the plugin bundle loads,
  all browser console output - including everything the BBB client logs via
  its bunyan logger - is kept in a bounded in-memory ring buffer.
- **Disconnect detection:** log lines are classified against the BBB client's
  own `logCode`s (e.g. `audio_failure`, `sfuaudio_reconnect_failed`,
  `sip_js_session_ua_disconnected`, `graphql_websocket_closed`), so the
  export shows explicitly *whether BBB itself noticed a disconnect*. In
  addition, the plugin records:
  - WebRTC peer connection / ICE state changes (`failed`, `disconnected`, …)
  - WebSocket close codes (1006 = abnormal closure)
  - browser `online`/`offline` events and tab visibility changes
  - uncaught JS errors and unhandled promise rejections
- **Connection quality timeline:** every 5 s the plugin reads the browser's
  WebRTC statistics of each media connection: round-trip time, packet loss
  and jitter in both directions, bitrate, concealed (filled-in) audio and the
  network path (direct, or relayed through a TURN server over UDP/TCP/TLS).
  This shows whether the network degraded before a disconnect, measured on
  the media connection itself - no speed test, no extra traffic, no
  third-party server.
- **Download anytime:** an entry *"Download diagnostic logs (ZIP)"* in the
  options dropdown (top right, next to "Leave meeting").
- **Disconnect panel:** when a disconnect is detected, a movable panel appears
  below the toast area ("Connection lost") offering the download directly.
  The panel is debounced (max. once per 30 s) and can be disabled via plugin
  settings. A deliberate end of the session - the meeting is ended, a
  moderator removes the user, or the user joins again in another tab - is
  not a disconnect: the panel waits 5 s before it opens, and connections
  that close because of such a session end are marked as expected instead.
- **GDPR consent dialog:** every download first shows a privacy notice
  explaining what the archive contains. The ZIP is created entirely
  client-side and is **never transmitted anywhere** - the user decides
  whether to hand it to support.

## Data minimization

Before anything is stored in the buffer:

- URL query strings (BBB session tokens), `sessionToken`/`token`/`password`
  parameters and JWTs are redacted.
- Names and user IDs of **other participants** (from the meeting roster) are
  replaced with stable pseudonyms (`[participant-1]`, …); the current user
  becomes `[self]`. Object keys that typically carry personal data
  (`message`, `email`, `extId`, …) are dropped during serialization.
- IP addresses (ICE candidates, SDP, URLs) are replaced with stable aliases
  (`[ip-1]`, …), so one address can still be followed through the logs.
- The quality timeline only takes numbers and candidate types (`host`,
  `srflx`, `relay`) from the WebRTC statistics - no addresses, ports or
  track IDs.

This is best-effort: free-text log content cannot be scrubbed with certainty,
which the consent dialog states. The archive intentionally contains the *own*
user and meeting ID (`session-info.json`) so support can correlate the report
with server logs.

## ZIP contents

| File | Content |
| --- | --- |
| `browser-console.log` | Full captured console output, one line per entry |
| `events.ndjson` | Classified connection events (JSON per line, `alerting: true` = disconnect indication, `expected` = closed by a deliberate session end) |
| `webrtc-stats.ndjson` | Connection quality every 5 s, one JSON per WebRTC connection and sample (fields below) |
| `session-info.json` | Browser/device info, meeting & user ID, capture window |
| `summary.txt` | Human-readable summary incl. all detected disconnects and the worst quality values per connection |

Fields in `webrtc-stats.ndjson` (values over the last 5 s interval; a field
is missing when the browser does not report it):

| Field | Meaning |
| --- | --- |
| `pc` | Connection, matches the `pc-N` entries in `events.ndjson` |
| `state` | `connectionState` of the connection |
| `path` | Candidate types of the selected ICE pair, e.g. `relay udp (TURN over tls) -> host` |
| `rttMs` | Round-trip time on the selected ICE pair |
| `availableOutKbps` | The browser's estimate of the available upload bandwidth; only while the connection sends video (with audio alone the estimate keeps growing up to 1 Gbit/s) |
| `audio`/`video` `.inKbps`, `.inLossPct`, `.inJitterMs` | Received media |
| `audio.concealedPct` | Share of the played-out audio the browser had to fill in (audible dropouts); not reported for the first interval of a new stream, which includes its start-up |
| `audio`/`video` `.outKbps`, `.outLossPct`, `.outJitterMs`, `.outRttMs` | Sent media; loss, jitter and RTT as reported back by the receiving side |

## Build

```bash
npm ci
npm run build-bundle
```

This produces `dist/BbbPluginLogCollection.js`, `dist/manifest.json` and
`dist/locales/`. Host them on any HTTPS server (or copy to
`/var/www/bigbluebutton-default/assets/plugins/bbbPluginLogCollection/` on a
BBB server) and register the manifest:

```properties
# /etc/bigbluebutton/bbb-web.properties (all meetings), or per /create call
pluginManifests=[{"url":"https://<host>/plugins/bbbPluginLogCollection/manifest.json"}]
```

BBB only loads the plugin if its plugin SDK version satisfies the manifest's
`requiredSdkVersion` (`^1.0.0-beta.3`; BBB 4.0.0-rc.4 and older ship SDK
0.1.x and reject it):

```bash
grep html5PluginSdkVersion /usr/share/bbb-web/WEB-INF/classes/bigbluebutton.properties
journalctl -u bbb-apps-akka | grep 'Cannot load plugin'   # rejected plugins
```

## Configuration

Optional settings via `/etc/bigbluebutton/bbb-html5.yml`:

```yml
public:
  plugins:
    - name: BbbPluginLogCollection
      settings:
        maxLogEntries: 10000        # console entries kept in memory
        showDisconnectPanel: true   # auto-panel on detected disconnects
        collectWebRtcStats: true    # connection quality timeline every 5 s
```

## Development

```bash
npm install
npm start          # dev server on :4701
npm run typecheck
```

See the [BBB plugin docs](https://docs.bigbluebutton.org/plugins) for how to
point a meeting at a locally served manifest.

## Limitations

- Capture starts when the plugin bundle loads - log lines from the very first
  moments of the page (before plugins are initialized) are not included.
- The buffer lives in memory: a full page reload starts a fresh capture.
- Detection `logCode`s and message texts are taken from BBB 4.0.0-rc.5
  sources; a text-pattern fallback records disconnect-looking
  warnings/errors from other versions.
