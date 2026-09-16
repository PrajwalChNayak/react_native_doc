import {parseLink, type LinkAction} from './parse';

/**
 * FIXED.
 *
 * Three rules, each closing one hole in `vulnerable.ts`:
 *
 *  1. Only accept links from origins we own: our custom scheme, or our verified
 *     https host. Anything else is ignored.
 *  2. Only navigate to paths on an explicit allow-list. The list is small on
 *     purpose — a route that should not be reachable from outside the app is
 *     simply not on it.
 *  3. Never open an external URL because a link asked us to. A disallowed
 *     `next` falls back to the home screen rather than failing open.
 */
const ALLOWED_PATHS: readonly RegExp[] = [
  /^\/$/,
  /^\/posts\/[1-9][0-9]{0,8}$/,
  /^\/settings$/,
];

export function isAllowedPath(path: string): boolean {
  return ALLOWED_PATHS.some((pattern) => pattern.test(path));
}

export function resolveFixed(url: string): LinkAction {
  const link = parseLink(url);
  if (!link || link.origin === 'other') return {type: 'ignore'};

  const next = link.query.next;
  if (next !== undefined) {
    return {type: 'navigate', to: isAllowedPath(next) ? next : '/'};
  }

  return {type: 'navigate', to: isAllowedPath(link.path) ? link.path : '/'};
}
