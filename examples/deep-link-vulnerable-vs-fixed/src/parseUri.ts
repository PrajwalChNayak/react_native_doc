/**
 * A small, explicit URI parser shared by BOTH handlers.
 *
 * ## Why not the global `URL`?
 *
 * Two reasons, and both are specific to React Native 0.87 rather than to
 * JavaScript in general.
 *
 * 1. There is no type for it. Under the Strict TypeScript API the
 *    `react-native` package exposes types only through
 *    `types_generated/index.d.ts`, and `URL` is not in that surface.
 *    `@react-native/typescript-config` sets `lib` to a list of `es*` entries
 *    with no `dom`, so a global `URL` does not type-check either.
 *
 * 2. React Native's own polyfill (`react-native/Libraries/Blob/URL.js`) is a
 *    regex-based partial implementation, not a WHATWG-compliant one. Its
 *    `hostname` and `origin` getters are anchored on `^https?://`, so for a
 *    custom-scheme link like `myapp://auth/callback` they return the empty
 *    string. A security check written against `url.hostname` would therefore
 *    compare `''` to your allow-list and behave very differently from what you
 *    tested in Node. That is a trap worth avoiding entirely.
 *
 * So: parse it yourself, in code you can read, and make the security decision
 * on fields whose meaning you actually control.
 *
 * This parser is deliberately *correct* and shared. The vulnerability in
 * `vulnerable.ts` is a policy bug, not a parsing bug — otherwise the contrast
 * would be about who wrote the better regex instead of about allow-listing.
 */

export type ParsedUri = Readonly<{
  /** Lowercased, without the trailing colon. `'myapp'`, `'https'`. */
  scheme: string;
  /**
   * Lowercased authority host, without the port, or `''` when the URI has no
   * `//` authority component.
   *
   * Note for custom schemes: in `myapp://auth/callback`, `auth` is the HOST,
   * not the first path segment. Android's `Intent.getData().getHost()` and
   * iOS's `URLComponents.host` both agree. Getting this wrong is a common
   * source of allow-lists that never match.
   */
  host: string;
  /** `''` when no explicit port is present. */
  port: string;
  /** Starts with `/` when non-empty. `''` when there is no path. */
  path: string;
  /** First occurrence of each key wins. Percent-escapes are decoded. */
  query: Readonly<Record<string, string>>;
  /**
   * True when the query string repeated a key. Different layers of a stack
   * disagree about whether first or last wins, so a strict handler should
   * refuse the input rather than pick a side.
   */
  hasDuplicateParams: boolean;
  /** Everything after the first `#`, without the `#`. */
  fragment: string;
}>;

const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+\-.]*):/;

/**
 * Decode percent-escapes without throwing on malformed input.
 *
 * `decodeURIComponent('%zz')` throws a `URIError`. An attacker controls this
 * string, so an uncaught throw here is a denial-of-service on your link
 * handler. Fall back to the raw text instead.
 *
 * Deliberately does NOT translate `+` to a space. `URLSearchParams` does,
 * because it implements `application/x-www-form-urlencoded`. Deep link
 * payloads are frequently opaque tokens rather than form submissions, and
 * silently rewriting a `+` inside one corrupts it.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Parse a deep link. Returns `null` when the input is not a URI at all —
 * callers must treat `null` as "reject", never as "empty".
 */
export function parseUri(raw: string): ParsedUri | null {
  const input = raw.trim();

  const schemeMatch = SCHEME_RE.exec(input);
  if (schemeMatch === null) {
    // No scheme at all. This includes protocol-relative input like
    // `//evil.example.net/x`, which some naive handlers happily resolve
    // against the app's own origin.
    return null;
  }

  const scheme = schemeMatch[1]!.toLowerCase();
  let rest = input.slice(schemeMatch[0].length);

  // Fragment first: per RFC 3986 it is terminated only by the end of the URI,
  // so everything after the first `#` is fragment and nothing after it is
  // query.
  let fragment = '';
  const hashIndex = rest.indexOf('#');
  if (hashIndex !== -1) {
    fragment = rest.slice(hashIndex + 1);
    rest = rest.slice(0, hashIndex);
  }

  let host = '';
  let port = '';
  if (rest.startsWith('//')) {
    rest = rest.slice(2);
    const authorityEnd = firstIndexOfAny(rest, ['/', '?']);
    const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
    rest = authorityEnd === -1 ? '' : rest.slice(authorityEnd);

    // Strip userinfo (`user:pass@host`). `https://app.example.com@evil.net/`
    // has host `evil.net`, not `app.example.com`. Allow-lists that forget this
    // are trivially bypassed.
    const atIndex = authority.lastIndexOf('@');
    const hostAndPort = atIndex === -1 ? authority : authority.slice(atIndex + 1);

    const colonIndex = hostAndPort.lastIndexOf(':');
    if (colonIndex !== -1 && /^[0-9]*$/.test(hostAndPort.slice(colonIndex + 1))) {
      host = hostAndPort.slice(0, colonIndex);
      port = hostAndPort.slice(colonIndex + 1);
    } else {
      host = hostAndPort;
    }
    host = host.toLowerCase();
  }

  let queryString = '';
  const questionIndex = rest.indexOf('?');
  if (questionIndex !== -1) {
    queryString = rest.slice(questionIndex + 1);
    rest = rest.slice(0, questionIndex);
  }

  const query: Record<string, string> = {};
  let hasDuplicateParams = false;
  if (queryString !== '') {
    for (const pair of queryString.split('&')) {
      if (pair === '') {
        continue;
      }
      const eqIndex = pair.indexOf('=');
      const rawKey = eqIndex === -1 ? pair : pair.slice(0, eqIndex);
      const rawValue = eqIndex === -1 ? '' : pair.slice(eqIndex + 1);
      const key = safeDecode(rawKey);
      if (Object.prototype.hasOwnProperty.call(query, key)) {
        hasDuplicateParams = true;
        continue; // first occurrence wins
      }
      query[key] = safeDecode(rawValue);
    }
  }

  return {
    scheme,
    host,
    port,
    path: rest,
    query,
    hasDuplicateParams,
    fragment,
  };
}

function firstIndexOfAny(value: string, needles: readonly string[]): number {
  let best = -1;
  for (const needle of needles) {
    const index = value.indexOf(needle);
    if (index !== -1 && (best === -1 || index < best)) {
      best = index;
    }
  }
  return best;
}

/**
 * Split a parsed URI into the path segments a route table matches against.
 *
 * For a custom scheme the host is the first segment (`myapp://profile/42` ->
 * `['profile', '42']`). For an https universal link the host is the domain and
 * only the path contributes (`https://app.example.com/profile/42` ->
 * `['profile', '42']`), which is what lets one route table serve both.
 */
export function routeSegments(uri: ParsedUri, hostIsRouteSegment: boolean): readonly string[] {
  const pathSegments = uri.path.split('/').filter(segment => segment !== '');
  if (hostIsRouteSegment && uri.host !== '') {
    return [uri.host, ...pathSegments];
  }
  return pathSegments;
}
