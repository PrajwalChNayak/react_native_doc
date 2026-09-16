---
title: Mocking Native Modules
description: Mock TurboModules and Fabric components in Jest under the New Architecture, and avoid mocking module shapes that no longer exist.
status: current
toolchain: cli
---

Jest runs in Node. There is no app process, no JSI runtime and no native code, so every call that
would cross into Kotlin or Swift has to be replaced with a JavaScript stand-in. React Native's Jest
preset does that for the core modules. Anything you wrote, and anything you installed, is your
responsibility.

The shape you mock matters. Under the New Architecture a native module is obtained through
`TurboModuleRegistry` from a generated spec, not looked up on a global object, so the mocking
recipes in most existing articles patch something the code under test never reads.

## Why it exists / when to use it — and when NOT to

Mock a native module when the test is about *your* logic and the native call is incidental: a hook
that persists a token, a screen that asks for a permission before opening the camera, a retry
policy around a network reachability check.

Do not mock a native module to test the native module. A mock proves that your JavaScript calls a
function you defined in the same file; it proves nothing about the Kotlin or Swift on the other
side, about Codegen wiring, or about whether the library is linked at all. That is what
[end-to-end tests](end-to-end.md) are for.

Also resist mocking the whole of `react-native`. It is a large module with interdependent parts,
and replacing it wholesale produces failures far from their cause.

## What the preset already mocks

`@react-native/jest-preset@0.87.1` installs mocks through its `setupFiles` entry for the core
surface. Among them:

| Mocked | Behaviour under Jest |
| --- | --- |
| `Dimensions` / `DeviceInfo` | A fixed 750x1334 device at scale 2 |
| `Linking` | `openURL`, `canOpenURL` etc. are spies |
| `AccessibilityInfo` | Screen reader reported as disabled |
| `AppState` | `currentState` is `'active'` |
| `UIManager`, `NativeComponentRegistry`, `requireNativeComponent` | Host components render as inert leaf nodes |
| `Vibration`, `Clipboard`, `Image`, `Modal`, `ScrollView`, `Text`, `TextInput`, `View`, `RefreshControl`, `ActivityIndicator` | Component mocks that render without native views |
| `useColorScheme` | Returns a fixed value rather than reading the system |

Nothing from `node_modules` outside React Native's own packages is mocked. If a library touches
native code, you supply the mock.

## Basic example — mocking your own TurboModule

Start from the spec, because the spec is the single import site every caller shares.

```ts title=src/specs/NativeSecureStore.ts
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule} from 'react-native';

export interface Spec extends TurboModule {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
}

// getEnforcing throws at import time if the native side is missing, which is the
// behaviour you want in the app and the reason the module must be mocked in Jest.
export default TurboModuleRegistry.getEnforcing<Spec>('SecureStore');
```

The code under test:

```ts-fragment title=src/auth/tokenStore.ts
import SecureStore from '../specs/NativeSecureStore';

const KEY = 'auth.refreshToken';

export async function saveRefreshToken(token: string): Promise<void> {
  if (token.length === 0) {
    throw new Error('refusing to store an empty token');
  }
  await SecureStore.setItem(KEY, token);
}

export async function loadRefreshToken(): Promise<string | null> {
  return SecureStore.getItem(KEY);
}
```

The mock replaces the spec module, so `getEnforcing` is never called:

```ts-fragment title=src/auth/__tests__/tokenStore.test.ts
import SecureStore from '../../specs/NativeSecureStore';
import {saveRefreshToken, loadRefreshToken} from '../tokenStore';

// Mock the SPEC module, not `react-native`. The spec is the only place the
// TurboModule is obtained, so one mock covers every caller.
jest.mock('../../specs/NativeSecureStore', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn().mockResolvedValue(undefined),
    getItem: jest.fn().mockResolvedValue(null),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const mocked = SecureStore as jest.Mocked<typeof SecureStore>;

beforeEach(() => {
  jest.clearAllMocks();
});

test('stores under a stable key', async () => {
  await saveRefreshToken('abc123');
  expect(mocked.setItem).toHaveBeenCalledWith('auth.refreshToken', 'abc123');
});

test('refuses an empty token before touching native', async () => {
  await expect(saveRefreshToken('')).rejects.toThrow('empty token');
  expect(mocked.setItem).not.toHaveBeenCalled();
});

test('returns null when nothing is stored', async () => {
  mocked.getItem.mockResolvedValueOnce(null);
  await expect(loadRefreshToken()).resolves.toBeNull();
});
```

`__esModule: true` plus `default` is required because the spec exports a default. Omitting it gives
you a module object whose `default` is `undefined`, and the failure appears as
`Cannot read properties of undefined` inside your own code rather than in the mock.

## How it works

Three layers can be replaced, and picking the right one decides how brittle the test is.

**1. The spec module (preferred).** One `jest.mock` path, typed against your own `Spec`, and the
mock survives every internal change to how React Native resolves modules. Use this by default.

**2. `TurboModuleRegistry`.** Occasionally you need to intercept a module you do not own the spec
for. `TurboModuleRegistry` is a namespace export of `react-native`, so this means partially mocking
`react-native` — narrowly:

```ts-fragment title=Intercepting the registry
const fakeClock = {now: jest.fn(() => 1_700_000_000_000)};

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return {
    ...actual,
    TurboModuleRegistry: {
      ...actual.TurboModuleRegistry,
      get: jest.fn((name: string) => (name === 'Clock' ? fakeClock : null)),
      getEnforcing: jest.fn((name: string) => {
        if (name === 'Clock') return fakeClock;
        return actual.TurboModuleRegistry.getEnforcing(name);
      }),
    },
  };
});
```

Spreading `actual` matters. Replacing the module wholesale removes `View`, `StyleSheet` and
everything else, and the resulting errors point at React's renderer rather than at your mock.

**3. The library's own mock.** Well-maintained native libraries ship one, and it is always better
than yours because it tracks the library's internals. Two that are installed in this handbook's
type-check harness:

```js title=jest.setup.js
// Verified present in the installed packages: react-native-reanimated ships
// `mock.js` at its package root, and react-native-gesture-handler ships
// `jestSetup.js` which registers its own jest.mock calls.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
require('react-native-gesture-handler/jestSetup');
```

Check for one before writing your own:

```bash
ls node_modules/<package> | grep -i -E 'jest|mock'
npm view <package> files
```

## Mocking a Fabric native component

A component produced by `codegenNativeComponent` is a host component. Under Jest the preset already
makes host components render as inert leaves, so the usual need is not to make it render but to
observe the props it receives, or to expose imperative commands.

```tsx title=src/specs/RNTBadgeNativeComponent.ts
import {codegenNativeComponent} from 'react-native';
import type {ViewProps, CodegenTypes} from 'react-native';

export interface NativeProps extends ViewProps {
  count?: CodegenTypes.Int32;
  label?: string;
}

export default codegenNativeComponent<NativeProps>('RNTBadge');
```

```tsx-fragment title=Observing props passed to a native component
import {render, screen} from '@testing-library/react-native';
import {CartBadge} from '../CartBadge';

// Replace the codegen'd component with a plain View that keeps a testID,
// so the props it would have received are queryable.
jest.mock('../../specs/RNTBadgeNativeComponent', () => {
  const {View} = require('react-native');
  return {__esModule: true, default: View};
});

test('passes the clamped count down to the native badge', () => {
  render(<CartBadge count={150} />);
  expect(screen.getByTestId('cart-badge').props.count).toBe(99);
});
```

## The failure everyone hits: mocking a module that no longer exists

Search results and older codebases mock native modules like this:

```js title=A recipe that no longer does anything
// This mutates the legacy NativeModules object. Under the New Architecture the
// module under test never reads from it, so the mock is simply ignored.
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.NativeModules.SecureStore = {setItem: jest.fn()};
  return rn;
});
```

`NativeModules` is still exported from `react-native` in 0.87 — it appears in the export surface —
but a TurboModule spec obtains its module through `TurboModuleRegistry`, not by reading a property
off `NativeModules`. Patching `NativeModules.SecureStore` therefore changes nothing the code under
test can see.

The symptom is distinctive and worth recognising: the mock appears to be installed, `jest.fn()`
records no calls, and the test fails with an invariant thrown from `getEnforcing` saying the native
module could not be found. If you see `getEnforcing` in the stack, you mocked the wrong layer.

The fix is always the same: mock the spec module, as in the basic example above.

> [!LEGACY] Where the old shape came from
> Before React Native 0.82 there was a Bridge, and native modules really were properties on a
> single `NativeModules` object populated at startup. That is why the recipe was correct for years
> and is wrong now. The legacy patterns and what replaced them are covered in
> [New Architecture Migration](../migration/new-architecture-migration.md).

## Platform differences

Mocks are JavaScript, so nothing here needs macOS and nothing differs between operating systems.

What does differ is which platform's implementation your mock is standing in for. A module with
different behaviour per platform — a permission that is always granted on one platform and prompts
on the other — needs a mock per platform, and the Jest preset resolves iOS files by default:

:::tabs
@tab iOS
```ts-fragment
jest.mock('../../specs/NativePermissions', () => ({
  __esModule: true,
  // iOS prompts once and remembers the answer, so a second request returns the
  // same value without showing UI.
  default: {request: jest.fn().mockResolvedValue('granted')},
}));
```
@tab Android
```ts-fragment
jest.mock('../../specs/NativePermissions', () => ({
  __esModule: true,
  // Android can return "never ask again", which your code must handle as a
  // terminal state rather than retrying.
  default: {request: jest.fn().mockResolvedValue('never_ask_again')},
}));
```
:::

## Security considerations

**Threat.** A mock that always returns success hides a real failure path. The classic case is
secure storage: a test suite that mocks `react-native-keychain` to resolve every call will pass
even if the production code ignores a rejected write and continues as though the token were saved.
The user then appears signed in with no credential persisted, and on some devices the write really
does fail — no biometric enrolment, a locked keystore after a device policy change.

**Exploit.** With the happy-path mock in place, delete the error handling in the code under test.
The suite stays green.

**Fix.** Test the rejection path explicitly, and make the mock capable of failing:

```ts-fragment title=Assert the failure path, not just the happy path
import SecureStore from '../../specs/NativeSecureStore';
import {saveRefreshToken} from '../tokenStore';

jest.mock('../../specs/NativeSecureStore', () => ({
  __esModule: true,
  default: {setItem: jest.fn(), getItem: jest.fn(), removeItem: jest.fn()},
}));

const mocked = SecureStore as jest.Mocked<typeof SecureStore>;

test('surfaces a keystore write failure instead of swallowing it', async () => {
  mocked.setItem.mockRejectedValueOnce(new Error('keystore unavailable'));
  await expect(saveRefreshToken('abc123')).rejects.toThrow('keystore unavailable');
});
```

**Verification.** Temporarily change the production code to `catch` and ignore the error. The test
above must go red. If it stays green, it is asserting the mock rather than the code.

Never put a real credential in a mock, even a test one. Test files are committed, and a token in a
fixture is a token in your git history forever. Use obviously fake values.

## Common mistakes

- **Patching `NativeModules.Foo`.** Wrong: assigning onto the legacy `NativeModules` object. Right:
  `jest.mock('../specs/NativeFoo', ...)`. The New Architecture obtains modules through
  `TurboModuleRegistry`, so the legacy object is not consulted.
- **Replacing `react-native` without spreading the actual module.** Wrong:
  `jest.mock('react-native', () => ({TurboModuleRegistry: {...}}))`. Right: spread
  `jest.requireActual('react-native')` first. Otherwise `View`, `Text` and `StyleSheet` vanish and
  the errors point everywhere except at the mock.
- **Forgetting `__esModule: true`.** Wrong: `jest.mock(path, () => ({default: {...}}))` for a
  TypeScript module with a default export. Right: include `__esModule: true`. Without it the
  interop layer hands your code `undefined`.
- **Writing a mock when the library ships one.** Wrong: hand-rolling a Reanimated mock. Right:
  `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`. Your
  version drifts from the library's internals on the next minor release.
- **Not clearing mocks between tests.** Wrong: relying on call counts across tests. Right:
  `jest.clearAllMocks()` in `beforeEach`, or `clearMocks: true` in the Jest config. Call-count
  assertions that pass in isolation and fail in a full run are almost always this.
- **Mocking so much that the test asserts nothing.** If every collaborator is a `jest.fn()`, the
  test verifies the order you wrote the calls in. Mock the boundary, keep your own logic real.

## Related topics

- [Jest Setup](jest-setup.md) — the preset that supplies the core mocks.
- [React Native Testing Library](testing-library.md) — rendering the components that use these modules.
- [TurboModules](../core-concepts/turbomodules.md) — what you are standing in for.
- [TurboModules End to End](../native-modules/turbomodules-end-to-end.md) — writing the module the spec describes.
- [Codegen and Spec Files](../native-modules/codegen-specs.md) — why the spec is the right mocking boundary.
- [End-to-End with Detox or Maestro](end-to-end.md) — the only layer that exercises the real native code.
- [New Architecture Migration](../migration/new-architecture-migration.md) — where the legacy module shape came from.
