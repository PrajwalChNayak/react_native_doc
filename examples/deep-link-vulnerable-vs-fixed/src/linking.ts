/**
 * Wiring the fixed handler to the real React Native `Linking` API.
 *
 * This file is type-checked by `npm run typecheck` but is NOT exercised by the
 * Jest suite: importing `react-native` into a plain Node test environment
 * requires the React Native Jest preset and a running app runtime, and mocking
 * `Linking` would only prove that the mock works. The security logic lives in
 * `fixed.ts`, which is pure and fully tested.
 *
 * Every type used here comes from the `react-native` root export. Under the
 * 0.87 Strict TypeScript API, deep imports into `react-native/Libraries/*` are
 * type errors: `package.json` maps that subpath to `"types": null`.
 */

import {Linking} from 'react-native';
import type {EventSubscription} from 'react-native';

import {handleDeepLinkFixed} from './fixed';
import type {DeepLinkAction, Session} from './types';

/**
 * The narrow slice of a navigator this needs. Depending on a structural type
 * rather than on `@react-navigation/native` keeps the example independent of a
 * navigation library version.
 */
export type DeepLinkNavigator = Readonly<{
  navigate(route: string, params: Readonly<Record<string, string>>): void;
}>;

export type DeepLinkHandlerOptions = Readonly<{
  navigator: DeepLinkNavigator;
  session: Session;
  /**
   * Called for every rejected link. Send this to your logging pipeline: a
   * sudden spike in rejections is either a bug in a link you shipped or
   * someone probing your intent filter, and you want to know which.
   */
  onRejected: (rawUrl: string, reason: string) => void;
  /** Called when `Linking.openURL` fails, e.g. no app can handle the URL. */
  onOpenFailed: (url: string, error: unknown) => void;
}>;

/**
 * Run one URL through the fixed handler and perform its action.
 * Returns the action so callers and tests can assert on the decision.
 */
export function dispatchDeepLink(
  rawUrl: string,
  options: DeepLinkHandlerOptions,
): DeepLinkAction {
  const action = handleDeepLinkFixed(rawUrl, options.session);

  switch (action.kind) {
    case 'navigate':
      options.navigator.navigate(action.route, action.params);
      break;
    case 'open-external':
      Linking.openURL(action.url).catch((error: unknown) => {
        options.onOpenFailed(action.url, error);
      });
      break;
    case 'reject':
      options.onRejected(rawUrl, action.reason);
      break;
  }

  return action;
}

/**
 * Handle the URL that cold-started the app.
 *
 * `Linking.getInitialURL()` is typed as `Promise<string | null | undefined>` in
 * 0.87 — it resolves to a nullish value when the app was launched from the
 * home screen rather than from a link, so the `== null` check is required, not
 * defensive noise.
 */
export async function handleInitialDeepLink(
  options: DeepLinkHandlerOptions,
): Promise<DeepLinkAction | null> {
  const initialUrl = await Linking.getInitialURL();
  if (initialUrl == null) {
    return null;
  }
  return dispatchDeepLink(initialUrl, options);
}

/**
 * Subscribe to links delivered while the app is already running.
 *
 * Call `.remove()` on the returned subscription when tearing down — in 0.87
 * `addEventListener` returns an `EventSubscription`, and the old
 * `Linking.removeEventListener(...)` form no longer exists.
 */
export function subscribeToDeepLinks(
  options: DeepLinkHandlerOptions,
): EventSubscription {
  return Linking.addEventListener('url', ({url}: {url: string}) => {
    dispatchDeepLink(url, options);
  });
}
