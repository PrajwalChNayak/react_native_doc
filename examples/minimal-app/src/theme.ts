import type { ColorSchemeName } from 'react-native';

export type Theme = {
  readonly background: string;
  readonly card: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly border: string;
};

const light: Theme = {
  background: '#f6f7f9',
  card: '#ffffff',
  text: '#14171a',
  muted: '#5b6570',
  accent: '#1d4ed8',
  border: '#d9dee4',
};

const dark: Theme = {
  background: '#0e1116',
  card: '#171b22',
  text: '#f2f4f7',
  muted: '#9aa4b2',
  accent: '#7aa2ff',
  border: '#272c35',
};

/**
 * In 0.87 `useColorScheme()` returns `ColorSchemeName | null`. It no longer
 * returns the string `'unspecified'`, so treat anything that is not `'dark'`
 * as light rather than testing for a third value that cannot occur.
 */
export function getTheme(scheme: ColorSchemeName | null): Theme {
  return scheme === 'dark' ? dark : light;
}
