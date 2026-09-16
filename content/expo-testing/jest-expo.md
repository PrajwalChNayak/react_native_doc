---
title: Jest with jest-expo
description: Setting up Jest on Expo SDK 57 with the jest-expo preset — the install that actually works, the missing @react-native/jest-preset peer, platform presets and transformIgnorePatterns.
status: current
toolchain: expo
sdk: 57
---

`jest-expo` is a Jest preset for Expo projects. It wraps React Native's Jest preset, adds Expo's
Babel configuration, mocks the native side of Expo modules, and understands the same asset
extensions Metro does. On SDK 57 it is **`jest-expo@~57.0.5`**, read from
`expo/bundledNativeModules.json`, and `npm view jest-expo version` also reports `57.0.5`.

Jest runs your code in Node, not on a device. It is the right tool for logic, hooks and component
behaviour — and the wrong tool for anything that depends on real native code.

## Why it exists / when to use it — and when NOT to

Use Jest with `jest-expo` for:

- Pure logic: formatters, reducers, validation, API clients with a mocked `fetch`.
- Hooks and components, with [React Native Testing Library](testing-library.md).
- Code that calls Expo modules, with the native side [mocked](mocking-expo-modules.md).

Do **not** use it to prove that:

- A native module works on a device. The native side is mocked; your test proves nothing about it.
- Navigation, gestures and animations feel right. Use [end-to-end tests](end-to-end.md).
- A config plugin produced the right native project. See
  [Testing and Failure Modes](../expo-config-plugins/testing-and-failures.md).

## Basic example

### 1. Install

```bash
npx expo install jest-expo jest @types/jest --dev
```

SDK 57 resolves these to `jest-expo@~57.0.5`, `jest@~29.7.0` and `@types/jest@29.5.14` — the `jest`
and `@types/jest` pins come from SDK 57's `relatedPackages` on the Expo versions API. That is
**Jest 29**, even though Jest 30 is `latest` on npm. `jest-expo` 57 is built on Jest 29 packages.

The `--dev` flag is `npx expo install`'s own option in SDK 57's `@expo/cli` (`--dev  Save the
dependencies as devDependencies`). Forwarding npm's flag instead — `-- --save-dev` — has been seen
to put the packages under `dependencies`. Whichever form you use, **check `package.json`
afterwards** and move them to `devDependencies` if they landed in the wrong place.

### 2. Install the React Native Jest preset — the step everyone misses

`jest-expo@57.0.5` declares a peer dependency on `@react-native/jest-preset` `^0.86.3`, and
`npx expo install jest-expo` does **not** install it. Without it, the first `jest` run fails
immediately:

```text
● Validation Error: An unknown error occurred in jest-expo: The React Native Jest preset that
jest-expo relies on has moved to a separate package. To migrate, please install
"@react-native/jest-preset" to fulfill jest-expo's peer dependency.
```

Install the version that matches SDK 57's React Native, **0.86.3**:

```bash
npx expo install @react-native/jest-preset@0.86.3 --dev
```

An explicit `@version` is honoured by `npx expo install` as written. **Do not install 0.87.x** —
that is the React Native version of the CLI half of this site, not of Expo SDK 57.

### 3. Configure

```json title=package.json
{
  "scripts": {
    "test": "jest --watchAll"
  },
  "jest": {
    "preset": "jest-expo"
  }
}
```

### 4. Write a test

```ts title=lib/__tests__/price.test.ts
import {describe, expect, it} from '@jest/globals';

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

describe('formatPrice', () => {
  it('formats whole dollars with two decimals', () => {
    expect(formatPrice(500)).toBe('$5.00');
  });
});
```

Importing `describe`, `it` and `expect` from `@jest/globals` makes the test file type-check without
relying on ambient globals. With `@types/jest` installed you can also use the globals directly.

```bash
npm test
```

## How it works

### What the preset does

Read from the installed `jest-expo/jest-preset.js`:

- Loads `@react-native/jest-preset` (this is why the peer is mandatory).
- Replaces the Babel transform with `babel-jest` using your project's Babel options (so
  `babel-preset-expo` applies, as it does under Metro).
- Maps `react-native-vector-icons` imports to `@expo/vector-icons`, mirroring Expo's Metro resolver.
- Transforms asset files (`png`, `jpg`, `svg`, `ttf`, `mp4`, `heic`, `avif`, `db` and the rest of
  Metro's asset list) into stubs.
- Adds a setup file that mocks the native module layer, including `expo-modules-core`'s
  `requireNativeModule`. See [Mocking Expo Modules](mocking-expo-modules.md).

### `transformIgnorePatterns`

Jest does not transform `node_modules` by default, but React Native and Expo packages ship
untranspiled code. The preset sets this pattern:

```text
/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation))
```

If you add a dependency that ships untranspiled ESM (you will see `SyntaxError: Cannot use import
statement outside a module` pointing into `node_modules`), you need your own
`transformIgnorePatterns`. **Your array replaces the preset's**, so copy the whole allow-list and add
to it:

```json title=package.json
{
  "jest": {
    "preset": "jest-expo",
    "transformIgnorePatterns": [
      "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|my-esm-package))"
    ]
  }
}
```

### Platform presets

`jest-expo` ships these presets (each is a directory in the installed package):

| Preset | Runs tests as |
| --- | --- |
| `jest-expo` | The standard React Native environment (iOS), for backwards compatibility |
| `jest-expo/ios` | iOS |
| `jest-expo/android` | Android |
| `jest-expo/web` | Web, in a JSDOM environment |
| `jest-expo/node` | Node, for server rendering |
| `jest-expo/universal` | All four, as separate Jest projects |

With `jest-expo/universal`, snapshots are saved per platform (`.snap.ios`, `.snap.android`,
`.snap.web`, `.snap.node`), and file suffixes such as `-test.ios.tsx` or `-test.native.tsx` restrict a
test to platforms. To run a subset, combine single-platform presets with `projects`:

```json title=package.json
{
  "jest": {
    "projects": [{"preset": "jest-expo/ios"}, {"preset": "jest-expo/android"}]
  }
}
```

## Platform differences

Tests run in Node on your machine regardless of preset. `jest-expo/ios` and `jest-expo/android`
change which platform-specific files are resolved and what `Platform.OS` reports; they do not run
iOS or Android. No preset needs macOS.

## Common patterns

### A setup file for shared mocks

Jest's `setupFilesAfterEnv` option runs a file before each test file. Put shared mocks and matcher
configuration there:

```json title=package.json
{
  "jest": {
    "preset": "jest-expo",
    "setupFilesAfterEnv": ["<rootDir>/jest.setup.ts"]
  }
}
```

### Coverage

```json title=package.json
{
  "jest": {
    "preset": "jest-expo",
    "collectCoverageFrom": [
      "**/*.{ts,tsx}",
      "!**/coverage/**",
      "!**/node_modules/**",
      "!**/.expo/**",
      "!expo-env.d.ts"
    ]
  }
}
```

## Performance considerations

- The universal preset runs every test four times. Use it when platform differences matter; use a
  single-platform preset for fast feedback.
- `--watchAll` re-runs everything; in large projects `jest --watch` (changed files only) is faster,
  but requires a git repository.

## Common mistakes

- **Skipping `@react-native/jest-preset`.** Jest fails with "The React Native Jest preset that
  jest-expo relies on has moved to a separate package". Install `@react-native/jest-preset@0.86.3`.
- **Installing `@react-native/jest-preset` 0.87.** That matches React Native 0.87 (the CLI half of
  this site). SDK 57 is on 0.86.3.
- **Installing Jest 30 because it is `latest`.** SDK 57 pins `jest@~29.7.0`; `jest-expo` 57 is built
  on Jest 29.
- **Assuming the install landed in `devDependencies`.** Check `package.json`. Forwarded
  `-- --save-dev` has put packages in `dependencies`.
- **Overriding `transformIgnorePatterns` with only your package.** You replace the preset's list and
  every Expo package stops being transformed.
- **Using `npm install` for `jest-expo`.** You get `latest`, which is not necessarily the SDK 57
  version. Use `npx expo install`.
- **Treating a passing Jest test as proof a native feature works.** The native side is mocked.

## Related topics

- [React Native Testing Library](testing-library.md) — rendering and querying components.
- [Mocking Expo Modules](mocking-expo-modules.md) — what jest-expo mocks and what you must mock yourself.
- [End-to-End on Development Builds](end-to-end.md) — tests that exercise real native code.
- [Testing in CI](ci.md) — running this on every pull request.
- [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md) — why the install command matters.
