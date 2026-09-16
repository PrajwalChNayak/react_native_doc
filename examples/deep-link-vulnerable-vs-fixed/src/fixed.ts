/**
 * The fixed handler.
 *
 * The rule it follows is the only one that scales: a deep link may do NOTHING
 * that is not on a list written in advance, in this file, by you. Not "nothing
 * that looks dangerous" — nothing that is not explicitly listed. Deny-lists of
 * bad hosts and bad schemes lose to the next encoding trick; an allow-list
 * does not, because an input the author never thought about falls off the end
 * and is rejected.
 *
 * Four separate allow-lists appear below, and each closes a different bug from
 * `vulnerable.ts`:
 *
 *   ALLOWED_SCHEMES          which URI schemes are even considered
 *   ALLOWED_UNIVERSAL_HOSTS  which https hosts count as "our" links
 *   ROUTES                   which screens a link can reach, and with what
 *   ALLOWED_RETURN_ORIGINS   where a post-auth redirect may send the user
 *
 * Everything else is a `reject` with a reason you can log.
 */

import {parseUri, routeSegments} from './parseUri';
import type {DeepLinkAction, Session} from './types';

/**
 * Custom schemes this app answers to. Keep this in sync with the
 * `<data android:scheme="..."/>` entries in
 * `android/app/src/main/AndroidManifest.xml` and with `CFBundleURLSchemes` in
 * `ios/<App>/Info.plist`. A scheme registered natively but missing here is
 * simply unreachable, which is the safe direction to fail.
 */
const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(['myapp']);

/**
 * Hosts whose https links are ours (Android App Links / iOS Universal Links).
 * Compared for exact equality against the PARSED host, lowercased by the
 * parser. No `includes`, no `endsWith`, no regex with an unanchored dot.
 */
const ALLOWED_UNIVERSAL_HOSTS: ReadonlySet<string> = new Set(['app.example.com']);

/**
 * Origins a post-authentication redirect may point at, as exact
 * `scheme://host[:port]` strings. An origin comparison — not a host
 * comparison — because `http://app.example.com` is not the same trust boundary
 * as `https://app.example.com`.
 */
const ALLOWED_RETURN_ORIGINS: ReadonlySet<string> = new Set([
  'https://app.example.com',
  'https://help.example.com',
]);

/**
 * An attacker-supplied URL costs you a parse and a set of allocations. Cap the
 * length before doing any of that.
 */
const MAX_URL_LENGTH = 2048;

type RoutePattern = Readonly<{
  /** A segment beginning with `:` captures a parameter under that name. */
  segments: readonly string[];
  /** The INTERNAL route name. Never taken from the URL. */
  route: string;
  /**
   * A pattern every captured parameter must match. A parameter with no entry
   * here is rejected, so adding a `:foo` segment without a validator fails
   * loudly instead of silently letting anything through.
   */
  validate: Readonly<Record<string, RegExp>>;
}>;

/**
 * The complete set of screens reachable from outside the app. A screen that is
 * not in this table cannot be opened by a link, no matter what the navigator
 * registers.
 */
const ROUTES: readonly RoutePattern[] = [
  {
    segments: ['profile', ':userId'],
    route: 'Profile',
    validate: {userId: /^[0-9]{1,12}$/},
  },
  {
    segments: ['order', ':orderId'],
    route: 'Order',
    validate: {orderId: /^[A-Z]{2}-[0-9]{6}$/},
  },
  {
    segments: ['settings'],
    route: 'Settings',
    validate: {},
  },
];

/** The one path that is allowed to hand the user off to another origin. */
const AUTH_CALLBACK_SEGMENTS: readonly string[] = ['auth', 'callback'];

export function handleDeepLinkFixed(rawUrl: string, _session: Session): DeepLinkAction {
  // NOTE: `_session` is accepted only so both handlers share a signature and
  // the tests can call them interchangeably. The fixed handler never reads it.
  // A session token has no business travelling in a URL, so the safest
  // implementation of "attach the token to the redirect" is to not have one.

  if (rawUrl.length > MAX_URL_LENGTH) {
    return {kind: 'reject', reason: 'url too long'};
  }

  const uri = parseUri(rawUrl);
  if (uri === null) {
    return {kind: 'reject', reason: 'not a URI'};
  }

  if (uri.hasDuplicateParams) {
    // Defence in depth rather than a demonstrated exploit here: this handler
    // takes the first occurrence, but a native layer or an analytics SDK
    // reading the same URL may take the last. Refuse ambiguous input instead
    // of letting two components disagree about what the link said.
    return {kind: 'reject', reason: 'duplicate query parameters'};
  }

  // Allow-list 1 and 2: which links are ours at all.
  let segments: readonly string[];
  if (ALLOWED_SCHEMES.has(uri.scheme)) {
    // Custom scheme: the host is the first route segment.
    segments = routeSegments(uri, true);
  } else if (uri.scheme === 'https' && ALLOWED_UNIVERSAL_HOSTS.has(uri.host)) {
    // Universal link: the host identifies us, the path selects the route.
    // Note that path segments are compared case-sensitively, which is what
    // RFC 3986 says. Hosts are case-insensitive and the parser lowercases
    // them.
    segments = routeSegments(uri, false);
  } else {
    return {kind: 'reject', reason: `scheme or host not allow-listed: ${uri.scheme}://${uri.host}`};
  }

  if (segmentsEqual(segments, AUTH_CALLBACK_SEGMENTS)) {
    return handleAuthCallback(uri.query['next']);
  }

  // Allow-list 3: which screens exist.
  for (const pattern of ROUTES) {
    const params = matchRoute(pattern, segments);
    if (params !== null) {
      // Only the parameters the route declared are forwarded. Extra query
      // parameters are dropped rather than passed along, so a screen can never
      // receive a key it did not ask for.
      return {kind: 'navigate', route: pattern.route, params};
    }
  }

  return {kind: 'reject', reason: `no route matches /${segments.join('/')}`};
}

function handleAuthCallback(next: string | undefined): DeepLinkAction {
  if (next === undefined || next === '') {
    return {kind: 'reject', reason: 'auth callback without a next parameter'};
  }

  const target = parseUri(next);
  if (target === null) {
    // Catches protocol-relative values such as `//evil.example.net/collect`,
    // which have no scheme and would otherwise be resolved against whatever
    // base the consuming code happened to use.
    return {kind: 'reject', reason: 'next is not an absolute URI'};
  }

  // Reject `javascript:`, `data:`, `file:`, `intent:` and every other scheme by
  // requiring https explicitly.
  if (target.scheme !== 'https') {
    return {kind: 'reject', reason: `next must be https, got ${target.scheme}:`};
  }

  const origin = target.port === ''
    ? `${target.scheme}://${target.host}`
    : `${target.scheme}://${target.host}:${target.port}`;

  if (!ALLOWED_RETURN_ORIGINS.has(origin)) {
    return {kind: 'reject', reason: `next origin not allow-listed: ${origin}`};
  }

  // The URL is returned exactly as supplied. Nothing from the session is
  // appended to it.
  return {kind: 'open-external', url: next};
}

function matchRoute(
  pattern: RoutePattern,
  segments: readonly string[],
): Readonly<Record<string, string>> | null {
  if (pattern.segments.length !== segments.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.segments.length; i++) {
    const expected = pattern.segments[i]!;
    const actual = segments[i]!;

    if (!expected.startsWith(':')) {
      if (expected !== actual) {
        return null;
      }
      continue;
    }

    const name = expected.slice(1);
    const validator = pattern.validate[name];
    if (validator === undefined) {
      // A parameter with no validator is a bug in the route table, not a
      // reason to accept the value.
      return null;
    }
    if (!validator.test(actual)) {
      return null;
    }
    params[name] = actual;
  }

  return params;
}

function segmentsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, i) => segment === b[i]);
}
