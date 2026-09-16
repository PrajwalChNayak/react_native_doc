/**
 * A deterministic dataset big enough that virtualization mistakes are visible
 * rather than theoretical. A seeded generator keeps runs comparable: if the
 * data changed between measurements, the measurements would not mean anything.
 */

export type Row = {
  id: string;
  title: string;
  subtitle: string;
  /** Pre-computed so row rendering stays pure formatting, never work. */
  badge: string;
  tall: boolean;
};

/** Mulberry32 — small, fast, and reproducible across platforms. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
  'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa',
];

export function makeRows(count: number, seed = 1): Row[] {
  const rand = seeded(seed);
  const rows: Row[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const a = WORDS[Math.floor(rand() * WORDS.length)];
    const b = WORDS[Math.floor(rand() * WORDS.length)];
    rows[i] = {
      id: String(i),
      title: `${a} ${b} ${i}`,
      subtitle: `Item ${i} of ${count}`,
      badge: String(Math.floor(rand() * 100)),
      // A third of rows are taller, so getItemLayout is genuinely unavailable
      // here. That is the realistic case, and the README explains why.
      tall: i % 3 === 0,
    };
  }
  return rows;
}

/** Fixed row heights, used by the FlatList `getItemLayout` variant. */
export const ROW_HEIGHT = 64;
export const ROW_HEIGHT_TALL = 96;

export function rowHeight(row: Row): number {
  return row.tall ? ROW_HEIGHT_TALL : ROW_HEIGHT;
}
