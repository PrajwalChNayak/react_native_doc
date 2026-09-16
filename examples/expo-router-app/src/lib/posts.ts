/**
 * Data for the example, plus the one piece of logic that matters for security:
 * validating a route param before using it.
 *
 * `posts/[id]` is reachable by deep link, so `id` is attacker-controlled input,
 * not a value your own UI produced. Validate its shape before it goes anywhere
 * near a lookup, a network call or a query.
 */

export type Post = {
  id: string;
  title: string;
  body: string;
};

export const POSTS: readonly Post[] = [
  {
    id: '1',
    title: 'Routes are files',
    body: 'src/app/posts/[id].tsx is the route. There is no navigator config to keep in sync.',
  },
  {
    id: '2',
    title: 'Layouts own navigation',
    body: 'Each _layout.tsx decides whether its children render as a stack, tabs or something else.',
  },
  {
    id: '3',
    title: 'Every route is a deep link',
    body: 'exporouterexample://posts/3 opens this screen. That is a feature and an attack surface.',
  },
];

/** Positive integer, no leading zero, at most nine digits. */
const POST_ID = /^[1-9][0-9]{0,8}$/;

/**
 * `useLocalSearchParams` can hand you a string, an array (for a repeated query
 * key) or nothing. Accept exactly one well-formed string.
 */
export function isValidPostId(id: unknown): id is string {
  return typeof id === 'string' && POST_ID.test(id);
}

export function findPost(id: unknown): Post | undefined {
  if (!isValidPostId(id)) return undefined;
  return POSTS.find((post) => post.id === id);
}
