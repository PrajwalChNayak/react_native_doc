/**
 * DO NOT SHIP THIS FILE.
 *
 * This is the handler almost every "add deep linking to your React Native app"
 * tutorial ends up with. It parses the URL correctly and then trusts what it
 * finds. Each numbered comment below is a separate, individually exploitable
 * bug; `src/__tests__/exploits.test.ts` proves every one of them.
 *
 * The threat model is the important part: on both platforms, ANY app on the
 * device — and any web page the user taps a link on — can send your app a URL.
 * An intent filter or an associated domain is an open, unauthenticated,
 * cross-application entry point. Treat every byte of it as attacker input,
 * exactly like a request body on your server.
 */

import {parseUri, routeSegments} from './parseUri';
import type {DeepLinkAction, Session} from './types';

/** The domain the team thinks of as "ours". */
const RETURN_HOST = 'app.example.com';

export function handleDeepLinkVulnerable(rawUrl: string, session: Session): DeepLinkAction {
  const uri = parseUri(rawUrl);
  if (uri === null) {
    return {kind: 'reject', reason: 'not a URI'};
  }

  // BUG 0 — no scheme or host allow-list.
  //
  // Anything that parses gets through. A malicious app can send
  // `https://evil.example.net/...` or `file:///...` straight into the logic
  // below just as easily as it can send `myapp://...`.

  const next = uri.query['next'];
  if (next !== undefined) {
    // BUG 1 — substring host check.
    //
    // `includes` asks "does this string contain our domain somewhere", which
    // is true for every one of these:
    //
    //   https://app.example.com.evil.net/collect   (suffix attack)
    //   https://evil.net/?ref=app.example.com      (query attack)
    //   https://app.example.com@evil.net/          (userinfo attack)
    //
    // A host check must compare the PARSED host for equality, never search the
    // raw string.
    if (next.includes(RETURN_HOST)) {
      // BUG 2 — token exfiltration.
      //
      // "Pass the session on so the user does not have to log in again" is a
      // real and common requirement. Combined with BUG 1 it hands the session
      // token to whatever host the attacker put in `next`, in a URL that will
      // sit in that server's access log forever.
      const separator = next.includes('?') ? '&' : '?';
      return {
        kind: 'open-external',
        url: `${next}${separator}token=${session.authToken}`,
      };
    }

    // BUG 3 — open redirect.
    //
    // Anything that is not "ours" is still opened, unvalidated, with whatever
    // scheme the attacker chose. `Linking.openURL` will happily hand
    // `intent://`, `tel:`, `sms:`, `market://` or another app's private scheme
    // to the OS, using your app's identity to do it.
    return {kind: 'open-external', url: next};
  }

  // BUG 4 — the route name comes from the URL.
  //
  // Whatever the attacker writes in the path becomes a navigation target, so
  // every screen registered in the navigator is externally reachable:
  // debug screens, internal admin tools, "delete account" confirmations,
  // screens that assume the user already passed a paywall or a re-auth step.
  const segments = routeSegments(uri, true);
  const route = segments.join('/');

  // BUG 5 — every query parameter is forwarded as a navigation param.
  //
  // The screen receives keys it never declared. Anything downstream that
  // spreads these params into a request body, a WebView `source.uri`, or a
  // state update inherits the injection.
  return {kind: 'navigate', route, params: uri.query};
}
