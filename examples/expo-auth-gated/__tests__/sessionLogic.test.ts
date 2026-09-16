import {describe, expect, it} from '@jest/globals';

import {isExpired, parseSession, serialiseSession, usableSession} from '../src/lib/sessionLogic';

const NOW = 1_700_000_000_000;
const valid = {token: 'demo-token', expiresAt: NOW + 60_000};

describe('parseSession', () => {
  it('round-trips a session', () => {
    expect(parseSession(serialiseSession(valid))).toEqual(valid);
  });

  it('treats a missing entry as signed out', () => {
    expect(parseSession(null)).toBeNull();
  });

  it('turns corrupt data into null instead of throwing', () => {
    for (const raw of ['', 'not json', '{"token":', 'null', '42', '[]']) {
      expect(parseSession(raw)).toBeNull();
    }
  });

  it('rejects a session with a blank token or non-numeric expiry', () => {
    expect(parseSession(JSON.stringify({...valid, token: ''}))).toBeNull();
    expect(parseSession(JSON.stringify({...valid, expiresAt: 'soon'}))).toBeNull();
  });
});

describe('expiry', () => {
  it('is not expired before expiresAt', () => {
    expect(isExpired(valid, NOW)).toBe(false);
  });

  it('is expired at the exact expiry instant', () => {
    expect(isExpired(valid, valid.expiresAt)).toBe(true);
  });

  it('usableSession drops an expired session', () => {
    expect(usableSession(serialiseSession(valid), valid.expiresAt + 1)).toBeNull();
    expect(usableSession(serialiseSession(valid), NOW)).toEqual(valid);
  });
});
