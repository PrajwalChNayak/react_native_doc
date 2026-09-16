/**
 * The parser is shared by both handlers, so the vulnerability in
 * `vulnerable.ts` cannot be blamed on a parsing bug. These tests pin down the
 * behaviour the security checks in `fixed.ts` depend on.
 */

import {parseUri, routeSegments} from '../parseUri';

describe('parseUri', () => {
  test('for a custom scheme, the first segment is the host', () => {
    // This is what Android's Intent.getData().getHost() and iOS's
    // URLComponents.host report, and getting it wrong is how allow-lists end
    // up never matching.
    const uri = parseUri('myapp://profile/42');
    expect(uri).not.toBeNull();
    expect(uri?.scheme).toBe('myapp');
    expect(uri?.host).toBe('profile');
    expect(uri?.path).toBe('/42');
  });

  test('the scheme and host are lowercased, the path is not', () => {
    const uri = parseUri('HTTPS://App.Example.COM/Profile/42');
    expect(uri?.scheme).toBe('https');
    expect(uri?.host).toBe('app.example.com');
    expect(uri?.path).toBe('/Profile/42');
  });

  test('userinfo is stripped, so the real host is what is returned', () => {
    const uri = parseUri('https://app.example.com@evil.net/collect');
    expect(uri?.host).toBe('evil.net');
  });

  test('a port is separated from the host', () => {
    const uri = parseUri('https://app.example.com:8443/x');
    expect(uri?.host).toBe('app.example.com');
    expect(uri?.port).toBe('8443');
  });

  test('a colon that is not a port stays part of the host', () => {
    const uri = parseUri('https://app.example.com:notaport/x');
    expect(uri?.host).toBe('app.example.com:notaport');
    expect(uri?.port).toBe('');
  });

  test('everything after the first # is fragment, never query', () => {
    const uri = parseUri('myapp://settings?a=1#b=2');
    expect(uri?.query).toEqual({a: '1'});
    expect(uri?.fragment).toBe('b=2');
  });

  test('a value containing :// survives intact', () => {
    const uri = parseUri('myapp://auth/callback?next=https://evil.net/x');
    expect(uri?.query['next']).toBe('https://evil.net/x');
  });

  test('percent escapes are decoded', () => {
    const uri = parseUri('myapp://auth/callback?next=https%3A%2F%2Fevil.net%2Fx');
    expect(uri?.query['next']).toBe('https://evil.net/x');
  });

  test('a malformed percent escape does not throw', () => {
    // decodeURIComponent('%zz') throws a URIError. An attacker controls this
    // string, so throwing here would be a denial of service.
    expect(() => parseUri('myapp://settings?a=%zz')).not.toThrow();
    expect(parseUri('myapp://settings?a=%zz')?.query['a']).toBe('%zz');
  });

  test('a repeated key is reported, and the first occurrence wins', () => {
    const uri = parseUri('myapp://settings?a=1&a=2');
    expect(uri?.hasDuplicateParams).toBe(true);
    expect(uri?.query['a']).toBe('1');
  });

  test('a protocol-relative URL has no scheme and is rejected', () => {
    expect(parseUri('//evil.net/collect')).toBeNull();
  });

  test('a bare string is rejected', () => {
    expect(parseUri('evil.net/collect')).toBeNull();
  });
});

describe('routeSegments', () => {
  test('includes the host for a custom scheme', () => {
    const uri = parseUri('myapp://profile/42');
    expect(uri).not.toBeNull();
    expect(routeSegments(uri!, true)).toEqual(['profile', '42']);
  });

  test('omits the host for a universal link', () => {
    const uri = parseUri('https://app.example.com/profile/42');
    expect(uri).not.toBeNull();
    expect(routeSegments(uri!, false)).toEqual(['profile', '42']);
  });

  test('empty segments from repeated slashes are dropped', () => {
    const uri = parseUri('https://app.example.com//profile//42/');
    expect(uri).not.toBeNull();
    expect(routeSegments(uri!, false)).toEqual(['profile', '42']);
  });
});
