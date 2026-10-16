/**
 * Data minimization (GDPR): the exported logs must not leak credentials and
 * should carry as little data about *other* participants as possible.
 *
 * Three mechanisms:
 *  1. Pattern redaction for secrets (session tokens, JWTs, URL queries).
 *  2. Participant pseudonymization: known user names / userIds (from the
 *     meeting roster) are replaced with stable aliases before anything is
 *     stored in the buffer. The current user is aliased as "[self]".
 *  3. IP addresses (ICE candidates, SDP, URLs) are replaced with stable
 *     aliases ("[ip-1]", ...), so one address can still be followed through
 *     the logs without being disclosed.
 *
 * This is best effort - free-text log messages BBB composes out of user
 * content cannot be scrubbed with certainty. The consent dialog states that.
 */

const SECRET_PARAM_PATTERN = /\b(sessionToken|authToken|token|password|secret|api[-_]?key)"?\s*[=:]\s*"?[^&"'\s,}]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g;
// Query strings frequently carry the session token in BBB URLs.
const URL_QUERY_PATTERN = /\b((?:https?|wss?):\/\/[^\s"'?]+)\?[^\s"']*/gi;

// An IPv4 address must not follow a word character, "." or a single "/":
// "Chrome/120.0.0.0" is a browser version, "wss://192.0.2.1" an address.
// (No lookbehind - older Safari versions cannot even parse it.)
const IPV4_OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_PATTERN = new RegExp(`(^|[^\\w./-]|//)(${IPV4_OCTET}(?:\\.${IPV4_OCTET}){3})(?!\\d|\\.\\d)`, 'g');
// Full or "::"-compressed IPv6. Colon-separated numbers such as times
// (12:34:56) have neither eight groups nor a "::".
const IPV6_PATTERN = /\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b|\b(?:[0-9a-f]{1,4}:){1,6}(?::[0-9a-f]{1,4}){1,6}\b/gi;
// Not personal, and meaningful when reading SDP and ICE lines.
const KEPT_IPS: string[] = ['0.0.0.0', '127.0.0.1'];

// Object keys whose string values are dropped during serialization because
// they typically hold personal data of participants.
export const PERSONAL_KEYS: string[] = [
  'fullname', 'fullName', 'username', 'userName', 'nameSortable',
  'authorName', 'senderName', 'email', 'extId', 'extUserId', 'externalUserId',
  'message', 'messageText', 'chatMessage', 'avatar',
];

interface ParticipantAlias {
  pattern: RegExp;
  alias: string;
}

let participantAliases: ParticipantAlias[] = [];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface ParticipantInfo {
  userId: string;
  name: string;
}

/**
 * Refresh the pseudonymization table from the current meeting roster.
 * Aliases are stable per userId for the lifetime of the page.
 */
const aliasByUserId = new Map<string, string>();

export function setParticipants(users: ParticipantInfo[], selfUserId?: string): void {
  const next: ParticipantAlias[] = [];
  users.forEach((user) => {
    if (!user?.userId) return;
    let alias = aliasByUserId.get(user.userId);
    if (!alias) {
      alias = user.userId === selfUserId ? '[self]' : `[participant-${aliasByUserId.size + 1}]`;
      aliasByUserId.set(user.userId, alias);
    }
    next.push({ pattern: new RegExp(escapeRegExp(user.userId), 'g'), alias });
    // Very short names would over-redact ordinary words.
    if (user.name && user.name.length >= 3) {
      next.push({ pattern: new RegExp(escapeRegExp(user.name), 'g'), alias });
    }
  });
  participantAliases = next;
}

const aliasByIp = new Map<string, string>();

function aliasIp(ip: string): string {
  if (KEPT_IPS.indexOf(ip) !== -1) return ip;
  const key = ip.toLowerCase();
  let alias = aliasByIp.get(key);
  if (!alias) {
    alias = `[ip-${aliasByIp.size + 1}]`;
    aliasByIp.set(key, alias);
  }
  return alias;
}

export function redactText(input: string): string {
  let out = input;
  try {
    out = out.replace(URL_QUERY_PATTERN, '$1?[query-redacted]');
    out = out.replace(SECRET_PARAM_PATTERN, '$1=[redacted]');
    out = out.replace(JWT_PATTERN, '[jwt-redacted]');
    out = out.replace(IPV4_PATTERN, (_match, prefix: string, ip: string) => `${prefix}${aliasIp(ip)}`);
    out = out.replace(IPV6_PATTERN, (ip) => aliasIp(ip));
    for (let i = 0; i < participantAliases.length; i += 1) {
      const { pattern, alias } = participantAliases[i];
      out = out.replace(pattern, alias);
    }
  } catch (e) {
    // Redaction must never break log capture; fall through with what we have.
  }
  return out;
}

/** Strip the query string (session token!) off a URL, keep origin + path. */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (e) {
    return url.split('?')[0];
  }
}
