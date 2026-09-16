---
title: Jest Setup
description: Configure Jest for a React Native 0.87 project with @react-native/jest-preset, and understand what the preset actually does.
status: current
toolchain: cli
---

Jest is the test runner a Community CLI project ships with. React Native 0.87 provides
`@react-native/jest-preset`, a preset that teaches Jest how to resolve platform extensions,
transform JSX and Flow-typed core files, stub out assets, and install the globals the runtime
expects. Without it, importing `react-native` in a test throws on the first syntax it does not
understand.

This page covers the unit-test layer only: fast, no device, no simulator. Behaviour that needs a
real app on a real device belongs in [End-to-End with Detox or Maestro](end-to-end.md).

## Why it exists / when to use it — and when NOT to

React Native's JavaScript is not plain ES modules. Core files use Flow syntax, components resolve
through `.ios.tsx` / `.android.tsx` extensions, and `require('./logo.png')` is a Metro concept that
Node knows nothing about. Jest needs all of that explained to it, and the preset is the explanation.

Use Jest for logic you can assert without a screen: reducers, selectors, formatting, hooks,
navigation param handling, and component behaviour through
[React Native Testing Library](testing-library.md).

Do **not** use Jest to prove that your app launches, that a native module is correctly linked, or
that a Fabric component draws anything. Jest runs in Node with every native call mocked, so those
tests pass whether or not the native side exists. That is a job for an end-to-end run.

## Basic example

A project created with `@react-native-community/cli@20.2.0 init` ships exactly this file:

```js title=jest.config.js
module.exports = {
  preset: '@react-native/jest-preset',
};
```

That is the whole default configuration. The matching `package.json` script is:

```json title=package.json (excerpt)
{
  "scripts": {
    "test": "jest"
  }
}
```

And the relevant dev dependencies the 0.87 template installs:

```json title=package.json (excerpt)
{
  "devDependencies": {
    "@react-native/babel-preset": "0.87.1",
    "@react-native/jest-preset": "0.87.1",
    "@types/jest": "^29.5.13",
    "jest": "^29.6.3"
  }
}
```

Run it:

:::tabs
@tab npm
```bash
npm test
npm test -- --watch
npm test -- --coverage
```
@tab yarn
```bash
yarn test
yarn test --watch
yarn test --coverage
```
@tab pnpm
```bash
pnpm test
pnpm test --watch
pnpm test --coverage
```
:::

## How it works

`@react-native/jest-preset@0.87.1` is a small object. Reading it is the fastest way to understand
why your tests behave the way they do:

| Key | What it sets | Why it matters to you |
| --- | --- | --- |
| `haste.defaultPlatform` | `ios` | A bare `./Button` import resolves `Button.ios.tsx` before `Button.tsx`. Your tests run the iOS branch unless you say otherwise. |
| `haste.platforms` | `android`, `ios`, `native` | The platform suffixes the resolver will consider at all. |
| `moduleNameMapper` | maps `react-native` and `react-native/*` to the package directory, plus an explicit alias for `react-native/setup-env` | Lets the preset's own resolver bypass the package `exports` map. |
| `resolver` | the preset's `jest/resolver.js` | Replaces Jest's default resolution so platform extensions work. |
| `transform` | `babel-jest` for `.js`/`.ts`/`.tsx`; an asset transformer for images and video | Strips Flow and compiles JSX; turns `import logo from './logo.png'` into a stub object instead of a parse error. |
| `transformIgnorePatterns` | `node_modules/(?!((jest-)?react-native\|@react-native(-community)?)/)` | Everything in `node_modules` is left untransformed **except** React Native's own packages. This single line causes most third-party library failures. |
| `setupFiles` | the preset's `jest/setup.js` | Defines `__DEV__`, a fake `performance.now`, `requestAnimationFrame`, `window`, `nativeFabricUIManager`, and installs the core native-module mocks. |
| `testEnvironment` | the preset's `jest/react-native-env.js` | A Node environment adjusted for React Native rather than jsdom. |

Two consequences are worth internalising.

**There is no DOM.** The environment is Node-based, not jsdom. `document`, `window.location` and
`localStorage` do not exist in any meaningful form. Code that branches on them will take the wrong
branch silently.

**Native is already mocked.** `setup.js` installs mocks for the core modules, so
`Dimensions.get('window')` returns a fixed 750x1334 device and `Linking.openURL` is a spy that
resolves. Your assertions run against those fixtures, not against a device. See
[Mocking Native Modules](mocking-native-modules.md) for third-party modules, which are **not**
covered.

## Common patterns

### Adding your own setup file

`preset` supplies `setupFiles`; you add `setupFilesAfterEnv` for anything that needs the test
framework to exist (for example, custom matchers or per-test cleanup).

```js title=jest.config.js
module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
```

```js title=jest.setup.js
// Third-party native modules are not covered by the RN preset — mock them once here
// rather than in every test file that happens to import them transitively.
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn().mockResolvedValue(true),
  getGenericPassword: jest.fn().mockResolvedValue(false),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
}));

// Fail a test that logs an unexpected error, so warnings do not accumulate unnoticed.
const originalError = console.error;
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    originalError(...args);
    throw new Error('console.error was called during a test');
  });
});
```

### Letting an untransformed dependency through

If a library publishes untranspiled ESM or Flow, Jest will fail on its first `import` statement
because `transformIgnorePatterns` excluded it. Extend the pattern rather than replacing it:

```js title=jest.config.js
const rn = 'node_modules/(?!((jest-)?react-native|@react-native(-community)?)/)';

module.exports = {
  preset: '@react-native/jest-preset',
  // Add libraries one at a time. A blanket `node_modules/` transform makes the
  // suite several times slower for no benefit.
  transformIgnorePatterns: [
    rn.replace(
      '@react-native(-community)?)/',
      '@react-native(-community)?|react-native-reanimated|@react-navigation)/',
    ),
  ],
};
```

### Choosing the platform under test

The preset defaults to iOS. To assert Android behaviour, run a second project rather than mutating
`Platform.OS` in a test:

```js title=jest.config.js
module.exports = {
  projects: [
    {
      displayName: 'ios',
      preset: '@react-native/jest-preset',
      haste: {defaultPlatform: 'ios', platforms: ['android', 'ios', 'native']},
    },
    {
      displayName: 'android',
      preset: '@react-native/jest-preset',
      haste: {defaultPlatform: 'android', platforms: ['android', 'ios', 'native']},
    },
  ],
};
```

### Code that is worth unit-testing

Pure functions are where Jest earns its keep. This compiles against the real 0.87 types:

```ts title=src/lib/formatPrice.ts
import {Platform} from 'react-native';

// Platform.select is a plain function at runtime, so this is testable without a device.
export function currencySpacing(): string {
  return Platform.select({ios: ' ', android: ' ', default: ' '});
}

export function formatPrice(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  return `${currency}${currencySpacing()}${amount}`;
}
```

```ts-fragment title=src/lib/__tests__/formatPrice.test.ts
import {formatPrice} from '../formatPrice';

test('renders two decimal places', () => {
  expect(formatPrice(1999, '$')).toContain('19.99');
});
```

> [!NOTE] Test files are fragments in this handbook
> Blocks that use Jest globals are marked `ts-fragment` because the handbook's type-check harness
> compiles with `types: []` and has no Jest type definitions installed. In your project,
> `@types/jest` is a dev dependency and the same code type-checks normally.

## Platform differences

Jest itself runs the same everywhere, including on Windows and Linux. What differs is which
platform's source files it resolves.

:::tabs
@tab iOS
`defaultPlatform: 'ios'` means `Component.ios.tsx` wins over `Component.tsx`, and
`Platform.OS === 'ios'` inside the preset's mocks. This is the default, so an unconfigured suite
silently tests only the iOS branch of every `Platform.select`.
@tab Android
Nothing about Jest requires macOS, so Android-branch tests run fine on any machine. You have to
ask for them: either a second Jest project as shown above, or a per-file override placed before
the import under test.
:::

## Performance considerations

- **Do not transform all of `node_modules`.** Widening `transformIgnorePatterns` to
  `[]` or `['node_modules/(?!.*)']` makes Babel compile thousands of files on a cold cache. Add
  packages individually.
- **`--coverage` is not free.** It instruments every transformed file. Run it in CI and on demand,
  not in watch mode.
- **`maxWorkers` matters in CI.** Most hosted runners report more cores than they can actually use.
  `jest --maxWorkers=2` is frequently faster than the default on a 2-core container. Measure on
  your runner rather than guessing; see [CI for Mobile](ci-for-mobile.md).
- **Keep the Jest cache between CI runs.** Babel transformation dominates a cold run.

## Common mistakes

- **Expecting a DOM.** Wrong: `expect(document.querySelector('button')).toBeTruthy()`. Right: query
  through the testing library's `screen`. The Jest environment here is Node-based, not jsdom, so
  `document` is not a usable browser document and DOM-based matchers assert nothing.
- **Seeing `SyntaxError: Cannot use import statement outside a module` and deleting
  `transformIgnorePatterns`.** Wrong: removing the key entirely. Right: add exactly the offending
  package to the negative lookahead. Removing the key means Babel transforms every dependency,
  which turns a 20-second suite into a multi-minute one.
- **Assuming the suite covers both platforms.** The preset defaults to `ios`. A `Platform.select`
  with a broken Android branch passes a green suite forever. Add an Android Jest project.
- **Mocking `Date.now` and forgetting `performance.now`.** The preset replaces `performance.now`
  with `jest.fn(Date.now)`. Freezing time with fake timers changes both, which surprises code that
  measures durations.
- **Treating a passing unit suite as proof the app runs.** Every native call is mocked. A library
  that is not linked at all, or that has no Fabric support, passes every Jest test and then crashes
  on launch. See [Native Dependency Compatibility](../migration/native-dependency-compatibility.md).
- **Adding `jsdom` as `testEnvironment` to "fix" missing globals.** It replaces the React Native
  environment and breaks the preset's mocks. If you need a browser global, define it in your own
  setup file instead.

## Related topics

- [React Native Testing Library](testing-library.md) — rendering components and querying them the way a user would.
- [Mocking Native Modules](mocking-native-modules.md) — TurboModule mocks and the shapes that changed.
- [Snapshot Testing](snapshot-testing.md) — when a snapshot earns its place and when it rots.
- [End-to-End with Detox or Maestro](end-to-end.md) — the layer Jest cannot reach.
- [CI for Mobile](ci-for-mobile.md) — running all of this on a hosted runner.
- [Project Structure](../getting-started/project-structure.md) — where test files live in a CLI project.
