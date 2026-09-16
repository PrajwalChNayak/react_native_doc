import {describe, expect, it} from '@jest/globals';

import {POSTS, findPost, isValidPostId} from '../src/lib/posts';

describe('isValidPostId', () => {
  it('accepts a positive integer string', () => {
    expect(isValidPostId('1')).toBe(true);
    expect(isValidPostId('123456789')).toBe(true);
  });

  it('rejects anything a crafted deep link might carry instead', () => {
    for (const bad of ['', '0', '01', '-1', '1.5', '1e3', '../admin', '1;drop', '1234567890']) {
      expect(isValidPostId(bad)).toBe(false);
    }
  });

  it('rejects the array form a repeated query key produces', () => {
    expect(isValidPostId(['1', '2'])).toBe(false);
    expect(isValidPostId(undefined)).toBe(false);
  });
});

describe('findPost', () => {
  it('finds a known post', () => {
    expect(findPost('2')?.title).toBe(POSTS[1].title);
  });

  it('returns undefined for a well-formed but unknown id', () => {
    expect(findPost('999')).toBeUndefined();
  });

  it('never looks up a malformed id', () => {
    expect(findPost('../1')).toBeUndefined();
  });
});
