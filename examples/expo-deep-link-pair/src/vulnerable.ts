import {parseLink, type LinkAction} from './parse';

/**
 * VULNERABLE. Do not copy.
 *
 * This is the shape most "handle the redirect after login" code takes: read a
 * `next` parameter from the incoming link and go there. Every part of a deep link
 * is attacker-controlled — anyone can put `expodeeplink://login?next=...` in a
 * web page, a QR code or a message — so this handler lets a stranger decide:
 *
 *  - which internal screen opens, including ones never meant to be linkable
 *    (`/admin/delete-account`);
 *  - which external site the app hands the user to, from inside a trusted app
 *    (an open redirect — the classic phishing primitive);
 *  - and it accepts links from origins it never verified.
 */
export function resolveVulnerable(url: string): LinkAction {
  const link = parseLink(url);
  if (!link) return {type: 'ignore'};

  const next = link.query.next;
  if (next) {
    if (/^https?:\/\//i.test(next)) {
      return {type: 'openExternal', url: next};
    }
    return {type: 'navigate', to: next};
  }

  return {type: 'navigate', to: link.path};
}
