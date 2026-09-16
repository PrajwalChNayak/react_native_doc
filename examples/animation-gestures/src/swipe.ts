/**
 * The decision rules behind the swipeable card, kept as pure functions.
 *
 * A gesture callback body runs as a worklet on the UI thread, where nothing is
 * observable from a test. Pulling the arithmetic out here means the behaviour
 * that actually matters — when does a swipe count, which way does it fly — can
 * be tested directly, and the worklet is left holding only the parts that must
 * touch shared values.
 */

export type Direction = 'left' | 'right';

export type SwipeConfig = {
  /** Card travel, in dp, past which a release commits the swipe. */
  distanceThreshold: number;
  /** Fling speed, in dp/second, that commits regardless of distance. */
  velocityThreshold: number;
  /** Screen width, used to decide how far the card must fly to leave. */
  width: number;
};

export const DEFAULT_CONFIG: SwipeConfig = {
  distanceThreshold: 110,
  velocityThreshold: 800,
  width: 375,
};

/**
 * A slow, deliberate drag past the distance threshold commits; so does a short
 * but fast flick. Requiring both would make the card feel sticky, and requiring
 * distance alone would ignore a flick that clearly expressed intent.
 */
export function shouldCommit(
  translationX: number,
  velocityX: number,
  config: SwipeConfig = DEFAULT_CONFIG,
): boolean {
  if (Math.abs(translationX) >= config.distanceThreshold) return true;
  if (Math.abs(velocityX) < config.velocityThreshold) return false;
  // A fast flick still has to be going the same way the card was dragged,
  // otherwise a bounce-back reads as a commit.
  return translationX !== 0 && Math.sign(velocityX) === Math.sign(translationX);
}

export function directionOf(translationX: number, velocityX: number): Direction {
  if (translationX !== 0) return translationX > 0 ? 'right' : 'left';
  return velocityX >= 0 ? 'right' : 'left';
}

/** Where the card lands when a swipe commits: just past the screen edge. */
export function restingX(direction: Direction, config: SwipeConfig = DEFAULT_CONFIG): number {
  const distance = config.width * 1.4;
  return direction === 'right' ? distance : -distance;
}

/**
 * Rotation is tied to horizontal travel so the card tilts into the swipe.
 * Clamped, because past about 12 degrees it stops reading as physical.
 */
export function rotationFor(translationX: number, config: SwipeConfig = DEFAULT_CONFIG): number {
  const ratio = translationX / (config.width / 2);
  const clamped = Math.max(-1, Math.min(1, ratio));
  return clamped * 12;
}

/** Fades the card as it approaches the commit distance. */
export function opacityFor(translationX: number, config: SwipeConfig = DEFAULT_CONFIG): number {
  const progress = Math.abs(translationX) / (config.distanceThreshold * 2);
  return Math.max(0.4, 1 - progress * 0.6);
}
