/**
 * Shared vocabulary for both deep link handlers.
 *
 * Both `handleDeepLinkVulnerable` and `handleDeepLinkFixed` take the same
 * inputs and return the same union, so the tests can run identical URLs
 * through both and compare the results directly. The only thing that differs
 * between them is the policy.
 */

/**
 * The part of your app session a deep link handler might be tempted to touch.
 * Kept deliberately small: the whole point of the vulnerable version is that it
 * hands `authToken` to a host it never validated.
 */
export type Session = Readonly<{
  authToken: string;
}>;

/**
 * What the handler decided to do. Returning a value instead of performing the
 * side effect is what makes this testable without a device or a mocked
 * `Linking` module — the navigation and `Linking.openURL` calls live in
 * `src/linking.ts`, which consumes this union.
 */
export type DeepLinkAction =
  | Readonly<{
      kind: 'navigate';
      /** An internal route name, not a URL path. */
      route: string;
      params: Readonly<Record<string, string>>;
    }>
  | Readonly<{
      kind: 'open-external';
      /** A URL that will be handed to `Linking.openURL`. */
      url: string;
    }>
  | Readonly<{
      kind: 'reject';
      /** Why the link was refused. Useful in tests and in your logs. */
      reason: string;
    }>;
