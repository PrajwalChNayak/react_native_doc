import { useCallback, useMemo, useReducer } from 'react';

import {
  counterReducer,
  initialCounterState,
  type CounterState,
} from './counter';

export type UseCounter = {
  state: CounterState;
  increment: () => void;
  decrement: () => void;
  setStep: (step: number) => void;
  reset: () => void;
};

/**
 * Thin React wrapper around the pure reducer in `./counter`.
 *
 * The hook holds no logic of its own so the logic stays testable without a
 * renderer.
 */
export function useCounter(): UseCounter {
  const [state, dispatch] = useReducer(counterReducer, initialCounterState);

  const increment = useCallback(() => dispatch({ type: 'increment' }), []);
  const decrement = useCallback(() => dispatch({ type: 'decrement' }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  const setStep = useCallback(
    (step: number) => dispatch({ type: 'setStep', step }),
    [],
  );

  return useMemo(
    () => ({ state, increment, decrement, setStep, reset }),
    [state, increment, decrement, setStep, reset],
  );
}
