/**
 * A deliberately small, deterministic URL parser for incoming deep links.
 *
 * It avoids the global `URL` on purpose: React Native's URL polyfill handles
 * custom schemes differently from Node's, so logic tested in Jest against
 * `new URL()` can behave differently on a device. A hand parser behaves the same
 * in both places, which is what makes the tests in __tests__ meaningful.
 */

export const APP_SCHEME = 'expodeeplink:';
export const WEB_HOST = 'example.com';

export type ParsedLink = {
  /** app = our custom scheme, web = our verified https host, other = anything else. */
  origin: 'app' | 'web' | 'other';
  /** Always starts with "/", percent-decoded. */
  path: string;
  query: Record<string, string>;
};

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    // Malformed percent-encoding is a reason to reject the link, not to guess.
    return null;
  }
}

const LINK = /^([a-z][a-z0-9+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?/i;

export function parseLink(url: string): ParsedLink | null {
  const match = LINK.exec(url.trim());
  if (!match) return null;

  const scheme = `${match[1].toLowerCase()}:`;
  const authority = (match[2] ?? '').toLowerCase();
  const rawPath = match[3] ?? '';

  let origin: ParsedLink['origin'] = 'other';
  let path = rawPath || '/';

  if (scheme === APP_SCHEME) {
    origin = 'app';
    // In expodeeplink://posts/42 the "authority" is really the first path segment.
    path = `/${[authority, rawPath.replace(/^\//, '')].filter(Boolean).join('/')}`;
  } else if (scheme === 'https:' && authority === WEB_HOST) {
    origin = 'web';
  }

  const decodedPath = safeDecode(path);
  if (decodedPath === null) return null;

  const query: Record<string, string> = {};
  for (const pair of (match[4] ?? '').split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = safeDecode(eq < 0 ? pair : pair.slice(0, eq));
    const value = safeDecode(eq < 0 ? '' : pair.slice(eq + 1));
    if (key === null || value === null) return null;
    query[key] = value;
  }

  return {origin, path: decodedPath, query};
}

/** What the app should do with an incoming link. */
export type LinkAction =
  | {type: 'navigate'; to: string}
  | {type: 'openExternal'; url: string}
  | {type: 'ignore'};
