import {
  DEFAULT_CONFIG,
  directionOf,
  opacityFor,
  restingX,
  rotationFor,
  shouldCommit,
  type SwipeConfig,
} from '../src/swipe';

const config: SwipeConfig = {...DEFAULT_CONFIG, width: 375};

describe('shouldCommit', () => {
  it('commits a slow drag past the distance threshold', () => {
    expect(shouldCommit(120, 0, config)).toBe(true);
    expect(shouldCommit(-120, 0, config)).toBe(true);
  });

  it('does not commit a short, slow drag', () => {
    expect(shouldCommit(40, 100, config)).toBe(false);
  });

  it('commits a short but fast flick', () => {
    expect(shouldCommit(30, 1200, config)).toBe(true);
  });

  it('ignores a fast flick going the opposite way to the drag', () => {
    // Releasing while the card springs back should not count as a swipe.
    expect(shouldCommit(30, -1200, config)).toBe(false);
  });

  it('treats the thresholds as inclusive', () => {
    expect(shouldCommit(config.distanceThreshold, 0, config)).toBe(true);
    expect(shouldCommit(10, config.velocityThreshold, config)).toBe(true);
  });
});

describe('directionOf', () => {
  it('follows the drag when there is one', () => {
    expect(directionOf(50, -900)).toBe('right');
    expect(directionOf(-50, 900)).toBe('left');
  });

  it('falls back to velocity when the card has not moved', () => {
    expect(directionOf(0, 900)).toBe('right');
    expect(directionOf(0, -900)).toBe('left');
  });
});

describe('restingX', () => {
  it('sends the card clear of the screen edge', () => {
    expect(restingX('right', config)).toBeGreaterThan(config.width);
    expect(restingX('left', config)).toBeLessThan(-config.width);
  });
});

describe('rotationFor', () => {
  it('is flat at rest', () => {
    expect(rotationFor(0, config)).toBe(0);
  });

  it('tilts into the swipe', () => {
    expect(rotationFor(60, config)).toBeGreaterThan(0);
    expect(rotationFor(-60, config)).toBeLessThan(0);
  });

  it('clamps so the card never over-rotates', () => {
    expect(rotationFor(100000, config)).toBeCloseTo(12);
    expect(rotationFor(-100000, config)).toBeCloseTo(-12);
  });
});

describe('opacityFor', () => {
  it('is fully opaque at rest', () => {
    expect(opacityFor(0, config)).toBe(1);
  });

  it('fades as the card travels, but never disappears', () => {
    expect(opacityFor(100, config)).toBeLessThan(1);
    expect(opacityFor(100000, config)).toBeGreaterThanOrEqual(0.4);
  });
});
