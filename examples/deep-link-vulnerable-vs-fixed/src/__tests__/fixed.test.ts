/**
 * A handler that rejects everything would pass `exploits.test.ts` trivially.
 * These tests prove the fixed handler is still a working deep link handler:
 * every link the product actually ships still resolves, on both the custom
 * scheme and the universal link host.
 */

import {handleDeepLinkFixed} from '../fixed';
import type {Session} from '../types';

const SESSION: Session = {authToken: 'SESSION-TOKEN-DO-NOT-LEAK'};

describe('legitimate links still work', () => {
  test('custom scheme route with a validated parameter', () => {
    expect(handleDeepLinkFixed('myapp://profile/42', SESSION)).toEqual({
      kind: 'navigate',
      route: 'Profile',
      params: {userId: '42'},
    });
  });

  test('the same route as a universal link', () => {
    expect(
      handleDeepLinkFixed('https://app.example.com/profile/42', SESSION),
    ).toEqual({
      kind: 'navigate',
      route: 'Profile',
      params: {userId: '42'},
    });
  });

  test('a route whose parameter has a stricter shape', () => {
    expect(handleDeepLinkFixed('myapp://order/AB-123456', SESSION)).toEqual({
      kind: 'navigate',
      route: 'Order',
      params: {orderId: 'AB-123456'},
    });
  });

  test('a route with no parameters', () => {
    expect(handleDeepLinkFixed('myapp://settings', SESSION)).toEqual({
      kind: 'navigate',
      route: 'Settings',
      params: {},
    });
  });

  test('the scheme is matched case-insensitively, as schemes are', () => {
    expect(handleDeepLinkFixed('MyApp://profile/42', SESSION)).toEqual({
      kind: 'navigate',
      route: 'Profile',
      params: {userId: '42'},
    });
  });

  test('a post-auth redirect to an allow-listed origin is permitted, verbatim', () => {
    expect(
      handleDeepLinkFixed(
        'myapp://auth/callback?next=https://app.example.com/welcome',
        SESSION,
      ),
    ).toEqual({
      kind: 'open-external',
      url: 'https://app.example.com/welcome',
    });
  });

  test('a second allow-listed origin also works', () => {
    expect(
      handleDeepLinkFixed(
        'myapp://auth/callback?next=https://help.example.com/faq',
        SESSION,
      ),
    ).toEqual({
      kind: 'open-external',
      url: 'https://help.example.com/faq',
    });
  });
});

describe('the boundaries of each allow-list', () => {
  test('a valid host on the wrong scheme is rejected', () => {
    expect(
      handleDeepLinkFixed('http://app.example.com/profile/42', SESSION),
    ).toEqual({
      kind: 'reject',
      reason: 'scheme or host not allow-listed: http://app.example.com',
    });
  });

  test('an allow-listed origin on a non-default port is a different origin', () => {
    expect(
      handleDeepLinkFixed(
        'myapp://auth/callback?next=https://app.example.com:8443/welcome',
        SESSION,
      ),
    ).toEqual({
      kind: 'reject',
      reason: 'next origin not allow-listed: https://app.example.com:8443',
    });
  });

  test('a subdomain of an allow-listed host is not allow-listed', () => {
    expect(
      handleDeepLinkFixed('https://staging.app.example.com/profile/42', SESSION),
    ).toEqual({
      kind: 'reject',
      reason: 'scheme or host not allow-listed: https://staging.app.example.com',
    });
  });

  test('a parameter that fails its pattern is rejected, not coerced', () => {
    expect(handleDeepLinkFixed('myapp://profile/not-a-number', SESSION)).toEqual({
      kind: 'reject',
      reason: 'no route matches /profile/not-a-number',
    });
  });

  test('extra path segments do not match a shorter route', () => {
    expect(handleDeepLinkFixed('myapp://profile/42/edit', SESSION)).toEqual({
      kind: 'reject',
      reason: 'no route matches /profile/42/edit',
    });
  });

  test('dot segments are segments, not traversal', () => {
    const action = handleDeepLinkFixed('myapp://profile/42/../../admin', SESSION);
    expect(action.kind).toBe('reject');
  });

  test('a repeated query key is refused rather than resolved', () => {
    expect(
      handleDeepLinkFixed(
        'myapp://auth/callback?next=https://app.example.com/ok&next=https://evil.net/x',
        SESSION,
      ),
    ).toEqual({
      kind: 'reject',
      reason: 'duplicate query parameters',
    });
  });

  test('an auth callback with no next parameter is refused', () => {
    expect(handleDeepLinkFixed('myapp://auth/callback', SESSION)).toEqual({
      kind: 'reject',
      reason: 'auth callback without a next parameter',
    });
  });

  test('an over-long URL is dropped before it is parsed', () => {
    const long = `myapp://profile/${'9'.repeat(4000)}`;
    expect(handleDeepLinkFixed(long, SESSION)).toEqual({
      kind: 'reject',
      reason: 'url too long',
    });
  });

  test('a string that is not a URI at all is refused', () => {
    expect(handleDeepLinkFixed('not a url', SESSION)).toEqual({
      kind: 'reject',
      reason: 'not a URI',
    });
  });

  test('an empty string is refused', () => {
    expect(handleDeepLinkFixed('', SESSION)).toEqual({
      kind: 'reject',
      reason: 'not a URI',
    });
  });
});
