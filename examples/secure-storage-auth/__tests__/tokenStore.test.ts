import {
  isExpired,
  needsRefresh,
  parse,
  serialise,
  type Session,
} from '../src/tokenStore';

const NOW = 1_700_000_000_000;

const session: Session = {
  accessToken: 'access-abc',
  refreshToken: 'refresh-xyz',
  expiresAt: NOW + 15 * 60 * 1000,
};

describe('serialise / parse', () => {
  it('round-trips a session', () => {
    expect(parse(serialise(session))).toEqual(session);
  });

  it('returns null for anything that is not JSON', () => {
    // A corrupted keychain entry must log the user out, not crash on launch.
    expect(parse('')).toBeNull();
    expect(parse('not json')).toBeNull();
    expect(parse('{"unclosed": ')).toBeNull();
  });

  it('returns null for JSON of the wrong shape', () => {
    expect(parse('null')).toBeNull();
    expect(parse('42')).toBeNull();
    expect(parse('"a string"')).toBeNull();
    expect(parse('[]')).toBeNull();
  });

  it('rejects a session with a missing or blank field', () => {
    expect(parse(JSON.stringify({...session, accessToken: undefined}))).toBeNull();
    expect(parse(JSON.stringify({...session, accessToken: ''}))).toBeNull();
    expect(parse(JSON.stringify({...session, refreshToken: ''}))).toBeNull();
  });

  it('rejects a non-numeric or non-finite expiry', () => {
    expect(parse(JSON.stringify({...session, expiresAt: 'soon'}))).toBeNull();
    expect(parse('{"accessToken":"a","refreshToken":"b","expiresAt":null}')).toBeNull();
  });
});

describe('isExpired', () => {
  it('is false while the token is still valid', () => {
    expect(isExpired(session, NOW)).toBe(false);
  });

  it('is true once the expiry has passed', () => {
    expect(isExpired(session, session.expiresAt + 1)).toBe(true);
  });

  it('treats the exact expiry instant as expired', () => {
    expect(isExpired(session, session.expiresAt)).toBe(true);
  });
});

describe('needsRefresh', () => {
  it('is false well before expiry', () => {
    expect(needsRefresh(session, NOW)).toBe(false);
  });

  it('is true inside the clock-skew window, before the token actually dies', () => {
    // The point of the skew: do not fire a request with a credential that
    // expires while it is in flight.
    const justInside = session.expiresAt - 10_000;
    expect(isExpired(session, justInside)).toBe(false);
    expect(needsRefresh(session, justInside)).toBe(true);
  });

  it('honours a custom skew', () => {
    const t = session.expiresAt - 60_000;
    expect(needsRefresh(session, t, 30_000)).toBe(false);
    expect(needsRefresh(session, t, 120_000)).toBe(true);
  });
});
