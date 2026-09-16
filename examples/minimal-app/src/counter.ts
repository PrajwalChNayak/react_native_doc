/**
 * Pure counter logic.
 *
 * Kept free of React and of `react-native` imports on purpose: pure modules are
 * the cheapest thing in a React Native app to unit test, because they need no
 * renderer, no native modules and no Metro transform beyond TypeScript.
 */

export type CounterState = {
  readonly count: number;
  readonly step: number;
  /** Most recent values first. Capped so the demo cannot grow without bound. */
  readonly history: readonly number[];
};

export type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'setStep'; step: number }
  | { type: 'reset' };

export const HISTORY_LIMIT = 10;

export const initialCounterState: CounterState = {
  count: 0,
  step: 1,
  history: [0],
};

function pushHistory(
  history: readonly number[],
  value: number,
): readonly number[] {
  return [value, ...history].slice(0, HISTORY_LIMIT);
}

export function counterReducer(
  state: CounterState,
  action: CounterAction,
): CounterState {
  switch (action.type) {
    case 'increment': {
      const count = state.count + state.step;
      return { ...state, count, history: pushHistory(state.history, count) };
    }
    case 'decrement': {
      const count = state.count - state.step;
      return { ...state, count, history: pushHistory(state.history, count) };
    }
    case 'setStep': {
      // Guard here rather than at the call site: the reducer is the only place
      // that can see every path into the state.
      if (!Number.isFinite(action.step) || action.step < 1) {
        return state;
      }
      return { ...state, step: Math.floor(action.step) };
    }
    case 'reset':
      return initialCounterState;
  }
}

/** Renders a signed integer with a thousands separator and an explicit sign. */
export function formatCount(count: number): string {
  const sign = count < 0 ? '-' : '';
  const digits = Math.abs(count)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${digits}`;
}
