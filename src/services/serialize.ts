import { PERSONAL_KEYS } from './redact';

const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 30;
const MAX_STRING_LENGTH = 2000;
const MAX_ARG_LENGTH = 4000;

const truncate = (value: string, max: number): string => (
  value.length > max ? `${value.slice(0, max)}…[truncated]` : value
);

function serializeValue(value: unknown, depth: number, seen: WeakSet<object>): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  const type = typeof value;
  if (type === 'string') return truncate(value as string, MAX_STRING_LENGTH);
  if (type === 'number' || type === 'boolean' || type === 'bigint') return String(value);
  if (type === 'function') return '[function]';
  if (type === 'symbol') return String(value);

  if (value instanceof Error) {
    const stack = value.stack ? `\n${value.stack.split('\n').slice(0, 6).join('\n')}` : '';
    return `${value.name}: ${value.message}${stack}`;
  }

  if (typeof Node !== 'undefined' && value instanceof Node) {
    return `<${(value as Element).nodeName?.toLowerCase() || 'node'}>`;
  }

  if (typeof value === 'object') {
    const obj = value as object;
    if (seen.has(obj)) return '[circular]';
    if (depth >= MAX_DEPTH) return '[object]';
    seen.add(obj);

    if (Array.isArray(obj)) {
      const items = obj.slice(0, MAX_ARRAY_ITEMS)
        .map((item) => serializeValue(item, depth + 1, seen));
      const suffix = obj.length > MAX_ARRAY_ITEMS ? `, …+${obj.length - MAX_ARRAY_ITEMS}` : '';
      return `[${items.join(', ')}${suffix}]`;
    }

    const keys = Object.keys(obj).slice(0, MAX_OBJECT_KEYS);
    const parts = keys.map((key) => {
      const raw = (obj as Record<string, unknown>)[key];
      // Drop values of keys that typically hold other participants' data.
      const serialized = PERSONAL_KEYS.indexOf(key) !== -1 && typeof raw === 'string'
        ? '"[redacted]"'
        : serializeValue(raw, depth + 1, seen);
      return `${key}: ${serialized}`;
    });
    return `{${parts.join(', ')}}`;
  }

  return String(value);
}

export function safeSerialize(value: unknown): string {
  try {
    return truncate(serializeValue(value, 0, new WeakSet()), MAX_ARG_LENGTH);
  } catch (e) {
    return '[unserializable]';
  }
}

/**
 * Render console.* arguments roughly the way DevTools would, including
 * printf-style directives (%s, %d, %c, ...) that browser-bunyan uses heavily.
 */
export function formatConsoleArgs(args: unknown[]): string {
  if (args.length === 0) return '';

  const parts: string[] = [];
  let rest = args.slice();

  if (typeof args[0] === 'string' && /%[sdifoOjc%]/.test(args[0])) {
    const format = args[0] as string;
    rest = args.slice(1);
    const rendered = format.replace(/%([sdifoOjc%])/g, (match, directive: string) => {
      if (directive === '%') return '%';
      const next = rest.shift();
      if (directive === 'c') return ''; // CSS styling directive — drop it and its arg
      if (directive === 'd' || directive === 'i') return String(Math.trunc(Number(next)));
      if (directive === 'f') return String(Number(next));
      return typeof next === 'string' ? next : safeSerialize(next);
    });
    parts.push(rendered);
  }

  rest.forEach((arg) => {
    parts.push(typeof arg === 'string' ? arg : safeSerialize(arg));
  });

  return parts.join(' ').trim();
}

/** Find a BBB `logCode` in any of the console arguments, if present. */
export function extractLogCode(args: unknown[]): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      const code = (arg as Record<string, unknown>).logCode;
      if (typeof code === 'string') return code;
    }
  }
  return undefined;
}
