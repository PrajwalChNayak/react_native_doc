import { findPost, POSTS } from '../src/data/posts';

describe('findPost', () => {
  it('finds a post by id', () => {
    const post = findPost('2');
    expect(post?.title).toBe('Strict TypeScript API');
  });

  it('returns undefined for an id that does not exist, rather than throwing', () => {
    // A deep link can carry any string. The details screen relies on this
    // returning undefined instead of crashing.
    expect(findPost('999')).toBeUndefined();
    expect(findPost('')).toBeUndefined();
  });

  it('has unique ids so keyExtractor is stable', () => {
    const ids = POSTS.map(post => post.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
