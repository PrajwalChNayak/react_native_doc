import type { LinkingOptions } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/**
 * Custom scheme plus an https prefix for universal / app links.
 *
 * The custom scheme must match `CFBundleURLSchemes` in `ios/<App>/Info.plist`
 * and the `<data android:scheme="...">` entry in `AndroidManifest.xml`. If
 * they disagree the OS never hands the URL to the app and the linking config
 * is never consulted — a very common cause of "deep links do nothing".
 */
export const DEEP_LINK_SCHEME = 'rnhandbook';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [`${DEEP_LINK_SCHEME}://`, 'https://handbook.example.com'],
  config: {
    screens: {
      Tabs: {
        screens: {
          Feed: 'feed',
          Settings: 'settings',
        },
      },
      PostDetails: 'post/:postId',
      Profile: {
        path: 'user/:userId',
        // `parse` runs on every param pulled out of the URL. Anything arriving
        // here came from outside the app, so treat it as untrusted input.
        parse: {
          highlight: (value: string) => decodeURIComponent(value),
        },
      },
    },
  },
};

/**
 * Builds a shareable link for a post. Kept next to the linking config so the
 * two cannot drift apart, and unit tested against `getStateFromPath`.
 */
export function postUrl(postId: string): string {
  return `${DEEP_LINK_SCHEME}://post/${encodeURIComponent(postId)}`;
}

export function profileUrl(userId: string, highlight?: string): string {
  const base = `${DEEP_LINK_SCHEME}://user/${encodeURIComponent(userId)}`;
  return highlight === undefined
    ? base
    : `${base}?highlight=${encodeURIComponent(highlight)}`;
}
