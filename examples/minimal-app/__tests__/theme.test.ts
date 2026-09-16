import { getTheme } from '../src/theme';

describe('getTheme', () => {
  it('returns the dark palette only for the dark scheme', () => {
    expect(getTheme('dark').background).toBe('#0e1116');
    expect(getTheme('light').background).toBe('#f6f7f9');
  });

  it('falls back to light when the scheme is null', () => {
    // `useColorScheme()` returns `ColorSchemeName | null` in 0.87.
    expect(getTheme(null)).toEqual(getTheme('light'));
  });
});
