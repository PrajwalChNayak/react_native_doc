export type Post = {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly authorId: string;
  readonly body: string;
};

export const POSTS: readonly Post[] = [
  {
    id: '1',
    title: 'The bridge is gone',
    author: 'Ada',
    authorId: 'ada',
    body: 'Since 0.82 React Native runs entirely on the New Architecture. The old bridge, and the flags that used to toggle it, no longer exist.',
  },
  {
    id: '2',
    title: 'Strict TypeScript API',
    author: 'Grace',
    authorId: 'grace',
    body: 'Deep imports into react-native/Libraries are type errors in 0.87. Refs use per-component instance types instead of the removed NativeMethods mixin.',
  },
  {
    id: '3',
    title: 'Typed routes are worth the setup',
    author: 'Alan',
    authorId: 'alan',
    body: 'Declaring ReactNavigation.RootParamList globally turns every untyped navigation helper into a typed one, so a wrong route name fails to compile.',
  },
];

export function findPost(postId: string): Post | undefined {
  return POSTS.find(post => post.id === postId);
}
