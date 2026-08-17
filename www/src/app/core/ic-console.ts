/**
 * Styled console lines for Interchouette (`%c[ic:…]`).
 * Tag pill + topic + local clock + nav-relative ms + optional key=value.
 */

export type IcConsoleNamespace = 'ic:chat';

export type IcConsoleLevel = 'log' | 'info' | 'warn' | 'error';

const NS_TAG_COLOR: Record<IcConsoleNamespace, string> = {
  'ic:chat': '#00e5ff',
};

const NS_TAG_ERROR = '#ff1744';
const STYLE_LABEL = 'color:#e8f7ff;font-weight:600';
const STYLE_CLOCK = 'color:#80cbc4;font-weight:600';
const STYLE_MS = 'color:#ffea00;font-weight:700';
const STYLE_KV = 'color:inherit;font-weight:normal;background:transparent';

function tagStyle(ns: IcConsoleNamespace, level: IcConsoleLevel): string {
  const fg = level === 'error' ? NS_TAG_ERROR : NS_TAG_COLOR[ns];
  return `color:${fg};font-weight:700;background:#0a0a0a;padding:0.1em 0.35em;border-radius:0.2em`;
}

function pad2(n: number, width = 2): string {
  return String(Math.trunc(n)).padStart(width, '0');
}

export function icClockStamp(date: Date = new Date()): string {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.` +
    `${pad2(date.getMilliseconds(), 3)}`
  );
}

export function icNowMs(): number {
  if (typeof performance === 'undefined') {
    return 0;
  }
  return performance.now();
}

export function icFormatKvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Error) {
    return value.message;
  }
  return JSON.stringify(value);
}

export function icFormatKv(kv?: Record<string, unknown>): string {
  if (!kv || Object.keys(kv).length === 0) {
    return '';
  }
  return Object.entries(kv)
    .map(([k, v]) => `${k}=${icFormatKvValue(v)}`)
    .join(' ');
}

export type IcConsoleWriteOptions = {
  ns: IcConsoleNamespace;
  topic: string;
  ms?: number;
  kv?: Record<string, unknown>;
  level?: IcConsoleLevel;
};

export function icConsoleWrite(options: IcConsoleWriteOptions): void {
  const { ns, topic, kv, level = 'log' } = options;
  const ms = options.ms ?? icNowMs();
  const clock = icClockStamp();
  const kvStr = icFormatKv(kv);
  const suffix = kvStr.length > 0 ? ` ${kvStr}` : '';
  console[level](
    `%c[${ns}]%c ${topic} %c${clock}%c %c${ms.toFixed(1)}ms%c${suffix}`,
    tagStyle(ns, level),
    STYLE_LABEL,
    STYLE_CLOCK,
    STYLE_KV,
    STYLE_MS,
    STYLE_KV,
  );
}
