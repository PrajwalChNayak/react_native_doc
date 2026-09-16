import {
  counterReducer,
  formatCount,
  HISTORY_LIMIT,
  initialCounterState,
  type CounterState,
} from '../src/counter';

describe('counterReducer', () => {
  it('increments and decrements by the current step', () => {
    let state = counterReducer(initialCounterState, { type: 'setStep', step: 5 });
    state = counterReducer(state, { type: 'increment' });
    expect(state.count).toBe(5);

    state = counterReducer(state, { type: 'increment' });
    expect(state.count).toBe(10);

    state = counterReducer(state, { type: 'decrement' });
    expect(state.count).toBe(5);
  });

  it('records history newest first and caps it', () => {
    let state: CounterState = initialCounterState;
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) {
      state = counterReducer(state, { type: 'increment' });
    }

    expect(state.history).toHaveLength(HISTORY_LIMIT);
    expect(state.history[0]).toBe(state.count);
    expect(state.history[1]).toBe(state.count - 1);
  });

  it('rejects a step below 1 or a non-finite step instead of corrupting state', () => {
    const zero = counterReducer(initialCounterState, { type: 'setStep', step: 0 });
    expect(zero).toBe(initialCounterState);

    const nan = counterReducer(initialCounterState, {
      type: 'setStep',
      step: Number.NaN,
    });
    expect(nan).toBe(initialCounterState);
  });

  it('floors a fractional step', () => {
    const state = counterReducer(initialCounterState, {
      type: 'setStep',
      step: 3.9,
    });
    expect(state.step).toBe(3);
  });

  it('resets back to the initial state', () => {
    let state = counterReducer(initialCounterState, { type: 'increment' });
    state = counterReducer(state, { type: 'reset' });
    expect(state).toEqual(initialCounterState);
  });

  it('never mutates the state it is given', () => {
    const before = JSON.stringify(initialCounterState);
    counterReducer(initialCounterState, { type: 'increment' });
    expect(JSON.stringify(initialCounterState)).toBe(before);
  });
});

describe('formatCount', () => {
  it('groups thousands and keeps the sign', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1,000');
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatCount(-1000)).toBe('-1,000');
  });
});
