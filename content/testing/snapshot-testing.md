---
title: Snapshot Testing
description: Where snapshots genuinely help, why large component snapshots rot, and how to keep the few you keep worth reviewing.
status: current
toolchain: cli
---

A snapshot test serialises a value — usually a rendered component tree — writes it to a `.snap`
file on first run, and on later runs fails if the serialisation differs. It is cheap to write and
it catches unintended change.

It is also the most over-used tool in a React Native test suite. This page argues for using it
narrowly and gives the rules that make the narrow use survive.

## Why it exists / when to use it — and when NOT to

A snapshot is a good fit when three things are true:

1. The output is **small** — tens of lines, not hundreds.
2. The output is **meaningful to a human** — a reviewer can look at the diff and say whether the
   change was intended.
3. There is **no better assertion** — the value has no single property that captures the intent.

That describes serialised data far more often than it describes a screen: a normalised API
response, a generated deep-link URL, a theme token object, the arguments a native module was called
with, an error message intended for a user.

It is a poor fit when the output is a full component tree. The failure mode is specific and
predictable:

- **Snapshots rot.** A 600-line snapshot changes whenever any descendant changes. The diff is
  large and mostly irrelevant.
- **Nobody reviews them.** Once a snapshot diff is routinely large, `--updateSnapshot` becomes
  reflex. A test that is always updated without reading is not a test.
- **They assert nothing about behaviour.** A snapshot records that the tree was serialised the same
  way. It cannot tell you the button is reachable, the error appears when the field is empty, or
  the request was sent. Those are the things that break.
- **They pass for broken UI.** Layout does not run under Jest, so a snapshot is identical whether
  the view is on screen or collapsed to zero height.

> [!BEST-PRACTICE] The rule of thumb
> If you cannot read the whole snapshot in a code review and say what it means, write an explicit
> assertion instead. `expect(screen.getByRole('alert')).toHaveTextContent('...')` says what you
> meant; a tree dump says only "unchanged".

## Basic example — a snapshot that earns its place

A pure function with structured output:

```ts title=src/deeplinks/buildShareUrl.ts
type ShareTarget = {
  screen: 'order' | 'product';
  id: string;
  campaign?: string;
};

// Small, deterministic, and every character of the result matters — a good
// candidate for a snapshot, because there is no single property to assert on.
export function buildShareUrl(target: ShareTarget): string {
  const params = new URLSearchParams({id: target.id});
  if (target.campaign !== undefined) {
    params.set('utm_campaign', target.campaign);
  }
  return `https://example.com/${target.screen}?${params.toString()}`;
}
```

```ts-fragment title=src/deeplinks/__tests__/buildShareUrl.test.ts
import {buildShareUrl} from '../buildShareUrl';

test('share url shapes', () => {
  expect([
    buildShareUrl({screen: 'order', id: '42'}),
    buildShareUrl({screen: 'product', id: 'sku-1', campaign: 'spring'}),
  ]).toMatchInlineSnapshot();
});
```

`toMatchInlineSnapshot()` writes the expected value into the test file itself on first run. That is
usually the right choice: the value sits next to the assertion, so a reviewer sees the change in
the diff of the test rather than in a file they have to open separately.

## How it works

Jest serialises the value with `pretty-format` and compares it to the stored string. For component
trees, `@testing-library/react-native` registers a serialiser so the output reads as JSX-like
markup rather than as a raw object graph.

Two mechanics decide how useful the result is.

**Where the snapshot lives.** `toMatchSnapshot()` writes to `__snapshots__/<file>.snap` next to the
test. `toMatchInlineSnapshot()` writes into the test file. Inline snapshots are reviewed; external
ones frequently are not.

**How non-determinism is handled.** Anything that varies between runs — a timestamp, a generated
id, a random colour — makes the snapshot fail on the second run. Property matchers replace those
fields with a type assertion:

```ts-fragment title=Property matchers for values that change every run
import {createOrder} from '../createOrder';

test('order shape', () => {
  expect(createOrder({sku: 'abc'})).toMatchSnapshot({
    id: expect.any(String),
    createdAt: expect.any(Number),
  });
});
```

Without those matchers you are forced to either update the snapshot on every run or freeze time
globally, and freezing time globally has consequences elsewhere in the suite.

## Common patterns

### Snapshotting one element, not the screen

If you do snapshot a component, snapshot the smallest interesting node. The testing library lets
you hand a single element to the matcher:

```tsx-fragment title=Narrow the blast radius
import {render, screen} from '@testing-library/react-native';
import {PriceTag} from '../PriceTag';

test('discounted price markup', () => {
  render(<PriceTag cents={1999} discountCents={500} />);
  // One element, not the whole tree: the diff stays readable when a parent changes.
  expect(screen.getByTestId('price-tag')).toMatchSnapshot();
});
```

### Snapshotting the call, not the render

The arguments a boundary was called with are usually the thing you actually care about, and they
are small:

```ts-fragment title=Snapshot the boundary
import Analytics from '../../specs/NativeAnalytics';
import {trackCheckout} from '../trackCheckout';

jest.mock('../../specs/NativeAnalytics', () => ({
  __esModule: true,
  default: {logEvent: jest.fn()},
}));

const mocked = Analytics as jest.Mocked<typeof Analytics>;

test('checkout event payload', () => {
  trackCheckout({cents: 1999, items: 2, currency: 'GBP'});
  expect(mocked.logEvent.mock.calls).toMatchInlineSnapshot();
});
```

### Making an accidental new snapshot fail CI

A snapshot that does not exist yet is written silently and the test passes. In CI that means a test
can be added with no expectation at all and still go green. Run CI with `--ci`, which turns a
missing snapshot into a failure:

```bash
jest --ci
```

Pair it with a review rule: a pull request that changes `.snap` files should say why in its
description.

### Deleting snapshots that outlived their test

Obsolete snapshots accumulate when tests are renamed or removed:

```bash
jest --ci --reporters=default          # reports obsolete snapshots
jest -u                                # removes obsolete ones (locally, never in CI)
```

## Platform differences

Snapshots run in Node and need neither a simulator nor macOS.

The trap is platform-dependent output. The Jest preset resolves `.ios` files by default, so a
component with an `.android.tsx` variant produces a different tree under an Android Jest project,
and a single `.snap` file cannot hold both. If you run both platforms (see
[Jest Setup](jest-setup.md)), give each project a distinct `displayName`; Jest keys snapshots by
project so the two do not overwrite each other.

Style values differ too. `StyleSheet` values that come from `Platform.select` or from elevation
versus shadow properties serialise differently per platform — another reason to snapshot data
rather than rendered styles.

## Performance considerations

- Snapshots are fast to run and slow to maintain. The cost is review time, not CPU time.
- Very large `.snap` files slow down `git diff`, code review tooling and your own reading. A
  snapshot over a few hundred lines has passed the point where anyone checks it.
- `toMatchInlineSnapshot` requires Jest to write back into the test file, which needs Prettier
  available. If your project does not have Prettier, use the external form.

## Common mistakes

- **Snapshotting a whole screen.** Wrong: `expect(render(<CheckoutScreen />).toJSON()).toMatchSnapshot()`.
  Right: assert the specific behaviour, or snapshot one element. A full-screen snapshot changes for
  reasons unrelated to the test and is updated without being read.
- **Running `jest -u` to make CI pass.** Wrong: updating snapshots until the build is green. Right:
  read the diff and decide whether the change was intended. `-u` deletes the only signal the test
  produced.
- **Committing a snapshot with a timestamp or a UUID in it.** Wrong: re-running `-u` daily. Right:
  property matchers (`expect.any(String)`), or inject a clock. A snapshot that changes on its own
  trains everyone to ignore snapshot failures.
- **Using a snapshot instead of an assertion you could write.** Wrong: snapshotting a component to
  check an error appears. Right: `expect(screen.getByRole('alert')).toHaveTextContent('...')`. The
  explicit assertion states the intent, so the failure message explains itself.
- **Assuming a passing snapshot means the UI is correct.** It means the serialisation is unchanged.
  A view can be zero-height, behind a modal or off-screen and produce an identical snapshot.
- **Not running CI with `--ci`.** Without it, a missing snapshot is created on the runner and the
  test passes, so a test with no expectation ships green.

## Related topics

- [React Native Testing Library](testing-library.md) — the explicit assertions that usually beat a snapshot.
- [Jest Setup](jest-setup.md) — configuration, including running both platforms.
- [Mocking Native Modules](mocking-native-modules.md) — snapshotting the arguments a boundary received.
- [End-to-End with Detox or Maestro](end-to-end.md) — the layer that can assert on what is actually on screen.
- [CI for Mobile](ci-for-mobile.md) — `--ci` and snapshot hygiene on a runner.
