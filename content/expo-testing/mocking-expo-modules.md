---
title: Mocking Expo Modules
description: How jest-expo mocks the native side of Expo modules in SDK 57, which packages ship automatic mocks, and how to mock the rest — expo-secure-store, expo-haptics, expo-constants and friends — with correct types.
status: current
toolchain: expo
sdk: 57
---

Every Expo module has a JavaScript API backed by native code. Jest runs in Node, where that native
code does not exist, so any test that reaches an Expo module needs the native side replaced. This is
the page to read when a test fails with `Cannot find native module`.

`jest-expo` (`~57.0.5`) mocks some of this for you. The rest you mock yourself, and doing it well is
mostly about **mocking at the right level**: the package's JavaScript API, not its internals.

## Why it exists / when to use it — and when NOT to

Mock an Expo module when the code under test calls it and you want to test **your** logic: what
happens when `getItemAsync` returns a token, returns `null`, or throws.

Do **not** mock a module to "prove" it works. A test where `SecureStore.setItemAsync` is a `jest.fn()`
proves only that you called it. Whether the Keychain or Keystore actually stored the value is an
[end-to-end](end-to-end.md) question.

And do not mock what you can run: plain JavaScript utilities, your own hooks and components should run
for real.

## Basic example

Code that reads a token from `expo-secure-store`:

```ts title=lib/session.ts
import * as SecureStore from 'expo-secure-store';

export async function isSignedIn(): Promise<boolean> {
  const token = await SecureStore.getItemAsync('session-token');
  return token !== null && token.length > 0;
}
```

A test that mocks the package's JavaScript API with a factory. The function under test is inlined so
this block stands alone:

```ts title=lib/__tests__/session.test.ts
import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import * as SecureStore from 'expo-secure-store';

// Replace the whole module with only the functions this code uses.
// jest.mock calls are hoisted above the imports by babel-jest.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

async function isSignedIn(): Promise<boolean> {
  const token = await SecureStore.getItemAsync('session-token');
  return token !== null && token.length > 0;
}

describe('isSignedIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is true when a token is stored', async () => {
    // jest.mocked gives the mock the real function's types, so a wrong return type is a compile error.
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('abc123');
    await expect(isSignedIn()).resolves.toBe(true);
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('session-token');
  });

  it('is false when nothing is stored', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    await expect(isSignedIn()).resolves.toBe(false);
  });

  it('propagates storage errors', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('keystore unavailable'));
    await expect(isSignedIn()).rejects.toThrow('keystore unavailable');
  });
});
```

## How it works

### What jest-expo mocks, read from its setup file

`jest-expo/src/preset/setup.js` runs before your tests. It:

1. Defines mocks for React Native's legacy `NativeModules` table, including a set of third-party native
   modules (react-native-screens, safe-area-context, gesture-handler, reanimated, svg, webview and
   others).
2. Mocks `expo-modules-core`, so `requireNativeModule('SomeModule')` and
   `requireOptionalNativeModule('SomeModule')` return a mock object instead of touching native code.
3. Installs web implementations of `EventEmitter`, `NativeModule` and `SharedObject`.
4. Mocks `expo-file-system/legacy` with resolved-promise functions.

### The automatic mock lookup — and where it stops

When an Expo package calls `requireNativeModule('ExpoFoo')`, the mocked `expo-modules-core` looks for a
file at `<package>/mocks/ExpoFoo` inside that package. If it exists, every exported function becomes a
`jest.fn()` wrapping the mock implementation. If there is no mock file and no other registered module,
`requireNativeModule` **throws** `Cannot find native module 'ExpoFoo'`.

So what matters is **which packages ship a `mocks/` directory**. In the SDK 57 packages installed for
this handbook's type-check workspace, these do:

| Ships `mocks/` | Does not |
| --- | --- |
| `expo-asset`, `expo-clipboard`, `expo-crypto`, `expo-file-system`, `expo-font`, `expo-linking`, `expo-location`, `expo-sensors` | `expo-secure-store`, `expo-haptics`, and others without the directory |

Check your own `node_modules` rather than trusting a list — it changes between SDK releases:

:::tabs
@tab macOS / Linux
```bash
ls -d node_modules/expo-*/mocks
```
@tab Windows (PowerShell)
```powershell
Get-ChildItem -Directory node_modules/expo-*/mocks
```
:::

> [!WARNING] Automatic mocks return nothing useful
> An automatic mock stops the crash; it does not give you data. For example, the installed
> `expo-location/mocks/ExpoLocation.ts` defines `getCurrentPositionAsync` as an empty `async` function,
> so it resolves `undefined`. Any test that depends on a return value must set one.

### Three ways to mock, and when to use each

| Technique | Scope | Use when |
| --- | --- | --- |
| `jest.mock('pkg', factory)` in the test file | One test file | Most cases. Explicit, local, easy to read. |
| A manual mock in `__mocks__/pkg.ts` next to `node_modules` | Every test | A module used everywhere (e.g. `expo-haptics`) with the same fake. |
| `jest.mock` in a `setupFilesAfterEnv` file | Every test | Same, when you prefer one setup file to a `__mocks__` directory. |

Jest uses a manual mock placed in a root-level `__mocks__` directory adjacent to `node_modules`
automatically for that package, without a `jest.mock` call in the test.

```ts title=__mocks__/expo-haptics.ts
import {jest} from '@jest/globals';

// Haptics have no observable result in a test; resolve immediately so awaiting code proceeds.
export const impactAsync = jest.fn(async () => {});
export const notificationAsync = jest.fn(async () => {});
export const selectionAsync = jest.fn(async () => {});

// Values copied from the installed expo-haptics Haptics.types.d.ts.
export const ImpactFeedbackStyle = {
  Light: 'light',
  Medium: 'medium',
  Heavy: 'heavy',
  Soft: 'soft',
  Rigid: 'rigid',
} as const;
export const NotificationFeedbackType = {
  Success: 'success',
  Warning: 'warning',
  Error: 'error',
} as const;
```

When you write a manual mock, check the enum values against the package's installed types
(`node_modules/expo-haptics/build/Haptics.types.d.ts`) rather than guessing. A mock with the wrong
constant values makes tests pass against behaviour the real module would not have.

## Common patterns

### Overriding a property on a real module: `mockProperty`

`jest-expo` exports helpers for replacing a single property and restoring it. Declared in the installed
`jest-expo` types: `mockProperty(module, propertyName, value)`, `unmockProperty(module, propertyName)`,
`unmockAllProperties()` and `mockLinking()`.

```ts title=lib/__tests__/environment.test.ts
import {afterEach, describe, expect, it} from '@jest/globals';
import Constants from 'expo-constants';
import {mockProperty, unmockAllProperties} from 'jest-expo';

function apiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as {apiBaseUrl?: string} | undefined;
  return extra?.apiBaseUrl ?? 'https://api.example.com';
}

describe('apiBaseUrl', () => {
  afterEach(() => {
    unmockAllProperties();
  });

  it('reads the configured URL', () => {
    mockProperty(Constants, 'expoConfig', {
      name: 'test',
      slug: 'test',
      extra: {apiBaseUrl: 'https://staging.example.com'},
    });
    expect(apiBaseUrl()).toBe('https://staging.example.com');
  });
});
```

`unmockAllProperties()` in `afterEach` matters: a property mock left in place leaks into every later
test in the file.

### Mocking a module that only some tests should mock

```ts-fragment
jest.mock('expo-location');            // automock from the package's mocks/ file
// ...in one test:
jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce({
  coords: {latitude: 51.5, longitude: -0.12, altitude: null, accuracy: 5,
           altitudeAccuracy: null, heading: null, speed: null},
  timestamp: Date.now(),
});
```

`mockResolvedValueOnce` affects only the next call, so other tests keep the default. This is a fragment
because it omits imports and the surrounding `it` block.

### Wrap native modules behind your own interface

The most maintainable approach for code with many native calls: put them behind a small module you
own, and mock **that** in component tests.

```ts title=lib/storage.ts
import * as SecureStore from 'expo-secure-store';

export const tokenStore = {
  get: () => SecureStore.getItemAsync('session-token'),
  set: (value: string) => SecureStore.setItemAsync('session-token', value),
  clear: () => SecureStore.deleteItemAsync('session-token'),
};
```

Component tests mock `lib/storage`, with three functions and your own names. One test file covers the
wrapper against a mocked `expo-secure-store`. When an SDK upgrade changes the Expo API, one file moves.

## Expo Go vs development build

Mocking is a Jest concern and is independent of Expo Go and development builds. The corollary: nothing
in this page tells you whether a native module is **present** in your build. A test can pass against a
mocked module your development build does not contain. That failure shows up only on a device.

## Common mistakes

- **Mocking the internals instead of the package.** Wrong: mocking `expo-modules-core` or
  `NativeModules` for one test. Right: `jest.mock('expo-secure-store', factory)`. The internals change
  between SDKs; the package API is what your code calls.
- **Assuming every Expo module is mocked automatically.** Only packages that ship a `mocks/` directory
  are. `expo-secure-store` does not, and `requireNativeModule` throws.
- **Relying on automatic mock return values.** They resolve `undefined`. Set the value the test needs.
- **Forgetting `jest.clearAllMocks()` / `unmockAllProperties()`.** Mock state leaks between tests and
  makes results depend on test order.
- **Untyped mocks.** Wrong: `(SecureStore.getItemAsync as any).mockResolvedValue(42)`. Right:
  `jest.mocked(SecureStore.getItemAsync).mockResolvedValue('token')`, which fails to compile with a wrong
  type.
- **Guessing enum values in manual mocks.** Read them from the installed `.d.ts` files.
- **Believing a mocked test proves native behaviour.** It proves your code called the mock. Use
  [end-to-end tests](end-to-end.md) for the rest.

## Related topics

- [Jest with jest-expo](jest-expo.md) — the preset that installs these mocks.
- [React Native Testing Library](testing-library.md) — rendering components that use mocked modules.
- [End-to-End on Development Builds](end-to-end.md) — testing the real native side.
- [expo-secure-store](../expo-sdk/secure-store.md) — the API mocked in the examples.
- [Clipboard and Haptics](../expo-sdk/clipboard-and-haptics.md) — the haptics API used in the manual mock.
