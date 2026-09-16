/**
 * Deep linking is the part of navigation that silently breaks: the config
 * compiles, the app builds, and the link lands on the wrong screen. Running
 * the real `getStateFromPath` against the real config catches that.
 */

import { getStateFromPath } from '@react-navigation/native';

import {
  DEEP_LINK_SCHEME,
  linking,
  postUrl,
  profileUrl,
} from '../src/navigation/linking';

/** Minimal shape of the navigation state tree `getStateFromPath` returns. */
type MinimalState = {
  routes: Array<{
    name: string;
    params?: object | undefined;
    state?: MinimalState | undefined;
  }>;
};

function resolve(url: string): MinimalState | undefined {
  const path = url.replace(`${DEEP_LINK_SCHEME}://`, '');
  return getStateFromPath(path, linking.config) as MinimalState | undefined;
}

function deepestRoute(state: MinimalState): {
  name: string;
  params?: object | undefined;
} {
  const route = state.routes[state.routes.length - 1];
  return route.state ? deepestRoute(route.state) : route;
}

describe('deep link config', () => {
  it('routes rnhandbook://post/2 to PostDetails with the id as a param', () => {
    const state = resolve(postUrl('2'));
    expect(state).toBeDefined();

    const route = deepestRoute(state!);
    expect(route.name).toBe('PostDetails');
    expect(route.params).toEqual({ postId: '2' });
  });

  it('routes rnhandbook://user/grace to Profile', () => {
    const state = resolve(profileUrl('grace'));
    const route = deepestRoute(state!);

    expect(route.name).toBe('Profile');
    expect(route.params).toEqual({ userId: 'grace' });
  });

  it('decodes the highlight query parameter through the parse function', () => {
    const state = resolve(profileUrl('ada', 'new architecture'));
    const route = deepestRoute(state!);

    expect(route.name).toBe('Profile');
    expect(route.params).toEqual({
      userId: 'ada',
      highlight: 'new architecture',
    });
  });

  it('routes the tab paths inside the Tabs navigator, not as top-level screens', () => {
    const feed = resolve(`${DEEP_LINK_SCHEME}://feed`);
    expect(feed!.routes[0].name).toBe('Tabs');
    expect(deepestRoute(feed!).name).toBe('Feed');

    const settings = resolve(`${DEEP_LINK_SCHEME}://settings`);
    expect(settings!.routes[0].name).toBe('Tabs');
    expect(deepestRoute(settings!).name).toBe('Settings');
  });

  it('does not resolve an unknown path onto a real screen', () => {
    const state = resolve(`${DEEP_LINK_SCHEME}://definitely/not/a/route`);
    const name = state === undefined ? undefined : deepestRoute(state).name;

    expect(name).not.toBe('PostDetails');
    expect(name).not.toBe('Profile');
  });

  it('percent-encodes ids when building a url', () => {
    expect(postUrl('a b')).toBe('rnhandbook://post/a%20b');
    expect(profileUrl('a/b', 'x&y')).toBe(
      'rnhandbook://user/a%2Fb?highlight=x%26y',
    );
  });

  it('declares both the custom scheme and the https prefix', () => {
    expect(linking.prefixes).toEqual([
      'rnhandbook://',
      'https://handbook.example.com',
    ]);
  });
});
