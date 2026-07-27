export function slugify(input: string, max = 42): string {
  const slug = input
    .toLowerCase()
    .replace(/https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return slug || 'session';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 2026-07-25-1432 — sortable, filesystem-safe, readable at a glance. */
export function stamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function clockTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function dateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function hhmm(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function noteFileBase(index: number): string {
  return String(index).padStart(2, '0');
}

/** 4:32 — elapsed time inside a recording. */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/** 0432 — mmss without the colon, for filenames. */
export function mmssFile(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${pad(Math.floor(total / 60))}${pad(total % 60)}`;
}

/** A typed-in folder path, trimmed and stripped of a trailing separator. */
export function cleanPath(path: string): string {
  return path.trim().replace(/[\\/]+$/, '');
}

/**
 * A path an agent can paste as-is (`C:\…`, `/…`, `~/…`) versus one that only means
 * something once you already know where the project is.
 */
export function looksAbsolute(path: string): boolean {
  return /^([a-zA-Z]:[\\/]|[\\/]|~[\\/])/.test(path);
}

/** Path relative to the site root, for compact display. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = `${u.pathname}${u.search}`;
    return path === '/' ? u.host : path;
  } catch {
    return url;
  }
}

export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

export function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
