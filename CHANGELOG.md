# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.5] - 2026-10-08

### Changed
- Version numbers follow the BigBlueButton line: 0.1.x for BigBlueButton 4.0
  (this version), 0.0.x for BigBlueButton 3.x.
- Requires BigBlueButton 4.0.0-rc.5 or newer (plugin SDK 1.0.0-beta.3);
  earlier 4.0 pre-releases no longer load the plugin.

### Fixed
- BigBlueButton 4.0.0-rc.5 refused to load the plugin because the plugin
  required plugin SDK 0.1.x.
- LiveKit media disconnects were not detected on BigBlueButton 4.0.0-rc.1 and
  newer, whose client logs them with new texts; dropped connections, room
  errors, stalled or exhausted reconnects and fatal media errors open the
  disconnect panel again. Leaving the meeting still does not.
- The plugin SDK requested `locales/index.json` to discover available
  translations, which did not exist and caused an HTTP 404 in the browser
  console; the locale index listing the bundled translations (English,
  German) is now shipped with the build.
- Disconnect detection did not trigger on production servers: BBB's console
  stream renders log messages as text but does not expose the `logCode`
  object, so detection now additionally matches the known log message texts
  (log codes still match in development mode).
- A manual log download (or cancelling its privacy dialog) wrongly
  suppressed the automatic disconnect panel for 5 minutes; suppression now
  only applies when the panel itself was dismissed.
- New plugin builds were not picked up by browsers because the manifest
  version (BBB's cache buster) stayed unchanged - the version is now bumped
  with every deployable change, and the plugin logs its version on startup
  so the active build is verifiable in the console.

### Added
- Detection of LiveKit room disconnects (the media transport in BBB 4.0),
  including reconnect attempts and fatal reconnects - matched both by log
  code (development) and by log message text (production).
- Automatic client-side capture of browser console logs (including all
  BigBlueButton client logs) into a bounded in-memory buffer.
- Disconnect detection based on the BBB client's own log codes (audio bridges,
  GraphQL connection), the client's "critical" connection-quality rating
  (the "loss in your connection" alert), WebRTC/ICE state changes, WebSocket
  close codes and browser online/offline events.
- "Download diagnostic logs (ZIP)" entry in the options dropdown (top right),
  available at any time.
- Automatic panel below the toast area offering the log download when a
  disconnect is detected, with a "Don't show again" option for the rest of
  the meeting.
- GDPR consent dialog shown before every download, explaining what the
  archive contains; the ZIP is created locally and never transmitted.
- Data minimization: session tokens, JWTs and URL query strings are redacted;
  names and IDs of other participants are pseudonymized on a best-effort
  basis before entries are stored.
- German and English localization.

### Security
- Updated development tooling (webpack-dev-server 6, copy-webpack-plugin 14)
  to resolve all `npm audit` findings and deprecated transitive packages
  (build output is unaffected).
