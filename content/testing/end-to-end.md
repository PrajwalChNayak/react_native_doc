---
title: End-to-End with Detox or Maestro
description: Choosing between Detox 20 and Maestro for React Native end-to-end tests, with an honest comparison of setup cost, speed, flakiness and CI fit.
status: current
toolchain: cli
---

An end-to-end test drives a real build of your app on a real simulator, emulator or device. It is
the only layer that proves the things Jest cannot: that the app launches, that native modules are
linked, that Fabric components draw, that a permission dialog can be dismissed, that a deep link
opens the right screen.

Two tools dominate the React Native ecosystem: **Detox** (`detox@20.51.4` on npm) and **Maestro**
(a JVM CLI distributed by mobile.dev, not on npm). They make opposite trade-offs, and the right
answer depends on your team more than on your app.

> [!WARNING] iOS end-to-end testing requires macOS
> Building and booting an iOS app needs Xcode, which runs only on macOS. Android end-to-end tests
> run on macOS, Linux and Windows. If your CI has no macOS runner, you can test Android end to end
> and nothing else. Plan for that before you choose a tool, not after.

## Why it exists / when to use it — and when NOT to

Write end-to-end tests for the handful of flows whose failure means the app is unusable: launch,
sign in, the core task, checkout or submit. Those are the flows where a broken native dependency,
a mis-signed build or a missing permission shows up, and where every other layer of testing is
blind.

Do not use end-to-end tests for logic, validation rules, edge cases or error copy. Each such test
costs a full app build, a device boot and tens of seconds of runtime, and each one is a chance for
a flake. That work belongs in [unit and component tests](testing-library.md), which run in
milliseconds and fail for exactly one reason.

A useful ratio in practice: hundreds of component tests, a dozen end-to-end flows. If your
end-to-end suite is growing faster than your unit suite, something is being tested at the wrong
level.

## Detox versus Maestro — the honest comparison

| | Detox 20.51.4 | Maestro |
| --- | --- | --- |
| Distribution | npm (`detox`, with a `detox` binary) | Standalone CLI from mobile.dev — `curl -fsSL "https://get.maestro.mobile.dev" \| bash`, a Homebrew tap, or a zip on Windows. **Not** the unrelated `maestro` package on npm |
| Prerequisites | Node, plus Xcode / Android SDK | **Java 17 or newer**, plus Xcode / Android SDK |
| Test language | JavaScript or TypeScript, running in Jest | YAML flows |
| Setup cost | High. A `.detoxrc.js` with a configuration per platform and build type, a dedicated build command, and usually native project changes | Low. Install the CLI, write a YAML file, point it at a build |
| Speed per test | Fast once running. Detox synchronises with the app and idles rather than polling | Slower per step. Maestro polls the view hierarchy and retries |
| Flakiness | Low **when the synchronisation model holds**; brittle when it does not — long-running timers, websockets and some animation libraries keep the app "busy" forever | Tolerant by design. Retries absorb timing noise, at the cost of hiding genuine slowness |
| Debuggability | Familiar: a Jest failure with a stack trace, plus device logs | A step-level failure with a screenshot; less to attach a debugger to |
| Platform support | iOS simulators and Android emulators/devices | iOS simulators and Android emulators/devices; Maestro also documents API-level support explicitly |
| CI fit | Good, but the config is a real artefact you maintain. `detox build` then `detox test` | Good. `maestro test --format=JUNIT` produces a JUnit report most CI systems already read |
| Team fit | Strong when the people writing tests are the people writing the app | Strong when QA or product people write flows, or when you want tests reviewable by non-engineers |
| Long-term cost | Config maintenance across upgrades | YAML expressiveness runs out on complex conditionals |

**A reasonable default:** start with Maestro. The setup cost is an afternoon rather than a sprint,
and for a dozen critical flows its slower per-step execution does not matter. Move to Detox if you
need the tests written in TypeScript alongside the app, need fine-grained synchronisation, or find
yourself fighting YAML to express a flow.

Neither is a reason to skip the lower layers. An end-to-end suite that exists because the unit
suite is thin is the most expensive testing strategy available.

## Basic example

### Maestro

Install the CLI. These commands come from Maestro's own installation documentation:

:::tabs
@tab macOS
```bash
# Java 17 or newer must be on PATH first, and Xcode plus the command line tools
# are required for iOS. Verify with: java -version
curl -fsSL "https://get.maestro.mobile.dev" | bash

# Or via Homebrew
brew tap mobile-dev-inc/tap
brew install mobile-dev-inc/tap/maestro

maestro --help
```
@tab Linux
```bash
# Android only — there is no iOS toolchain on Linux.
curl -fsSL "https://get.maestro.mobile.dev" | bash
maestro --help
```
@tab Windows
```bash
# Download maestro.zip from the GitHub releases page, extract it to a stable
# location, then add its bin directory to PATH and restart the terminal.
maestro --help
```
:::

A flow is a YAML file. `appId` is the Android application id or the iOS bundle identifier:

```text title=.maestro/sign-in.yaml
appId: com.example.app
---
- launchApp:
    clearState: true
- tapOn: "Email"
- inputText: "ada@example.com"
- tapOn: "Password"
- inputText: "correct horse battery staple"
- tapOn: "Sign in"
# Assertions are the point. Without one, the flow only proves nothing crashed.
- assertVisible: "Your orders"
- assertVisible:
    id: "order-list"
```

Run it against a booted device:

```bash
maestro list-devices
maestro test .maestro/sign-in.yaml
maestro test .maestro --platform=android --format=JUNIT --output=reports/maestro.xml
```

`maestro studio` opens an interactive view of the running app that generates selectors, which is
the fastest way to discover what a screen actually exposes.

### Detox

Detox is an npm dev dependency. Verified metadata: version `20.51.4`, peer
`jest: 30.x.x || 29.x.x || 28.x.x || ^27.2.5`, and it installs a `detox` binary.

```bash
npm install --save-dev detox@20.51.4 jest
npx detox init
```

Configuration names one entry per platform and build type:

```js title=.detoxrc.js
/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {$0: 'jest', config: 'e2e/jest.config.js'},
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      // These paths must match what your build actually produces. Run the build
      // command once by hand and copy the real path rather than guessing.
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/App.app',
      build:
        'xcodebuild -workspace ios/App.xcworkspace -scheme App ' +
        '-configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build:
        'cd android && ./gradlew assembleDebug assembleAndroidTest ' +
        '-DtestBuildType=debug',
    },
  },
  devices: {
    simulator: {type: 'ios.simulator', device: {type: 'iPhone 15'}},
    emulator: {type: 'android.emulator', device: {avdName: 'Pixel_7_API_34'}},
  },
  configurations: {
    'ios.sim.debug': {device: 'simulator', app: 'ios.debug'},
    'android.emu.debug': {device: 'emulator', app: 'android.debug'},
  },
};
```

```ts-fragment title=e2e/signIn.test.ts
import {by, device, element, expect as detoxExpect} from 'detox';

describe('sign in', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true, delete: true});
  });

  it('signs in and lands on the orders screen', async () => {
    await element(by.id('email')).typeText('ada@example.com');
    await element(by.id('password')).typeText('correct horse battery staple');
    await element(by.id('submit')).tap();
    await detoxExpect(element(by.text('Your orders'))).toBeVisible();
  });
});
```

```bash
npx detox build --configuration android.emu.debug
npx detox test  --configuration android.emu.debug
```

> [!NOTE] The Detox paths above are examples, not verified output
> `binaryPath` and the build commands depend on your scheme names, product name and Gradle
> configuration. Run the build once and copy the path it prints. This handbook does not show
> terminal output it has not produced.

## How it works

The two tools reach into the app in fundamentally different ways, which explains every other
difference between them.

**Detox instruments the app.** A native test harness is linked into a debug build, so Detox can ask
the runtime whether anything is still pending — network requests, timers, animations, the React
Native queues. It waits for the app to be idle instead of sleeping. That is why Detox tests do not
need arbitrary `sleep` calls and why they are fast.

The same mechanism is the failure mode. An app that is *never* idle — a `setInterval` polling every
second, an open websocket, a long-running animation — leaves Detox waiting until it times out.
Diagnosing that means finding what keeps the app busy, and the fix is usually in your app rather
than in the test.

**Maestro drives from the outside.** It reads the accessibility hierarchy through the platform's
own automation interfaces and retries each step until it matches or the step's timeout elapses. It
knows nothing about React Native internals, which is why it needs no instrumentation, works against
a release build, and never gets stuck on an app that is permanently busy.

The same design is why it is slower per step and why it can hide a real problem: a screen that
takes four seconds to appear passes just as a screen that takes 200 milliseconds does.

Both tools find elements through accessibility. `testID` on a React Native component becomes the
accessibility identifier on iOS and the view tag on Android, and `accessibilityLabel` becomes the
accessible name. That is the same surface [React Native Testing Library](testing-library.md) queries,
so components built to be queryable by role and label are automatically easier to drive end to end.

## Common patterns

### Give the flows stable handles

```tsx title=src/screens/SignInScreen.tsx
import {useState} from 'react';
import {View, Text, TextInput, Pressable, StyleSheet} from 'react-native';

export function SignInScreen({onSubmit}: {onSubmit: (email: string) => void}) {
  const [email, setEmail] = useState('');

  return (
    <View style={styles.root}>
      {/* testID is the handle both Detox and Maestro use. accessibilityLabel
          serves real users AND makes the element findable by name. */}
      <TextInput
        testID="signin.email"
        accessibilityLabel="Email"
        inputMode="email"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <Pressable testID="signin.submit" accessibilityRole="button" onPress={() => onSubmit(email)}>
        <Text>Sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, gap: 12, padding: 16},
});
```

Namespace the ids (`signin.email`, not `email`). A flat id space collides the moment two screens
both have an email field, and the failure is a test that taps the wrong control.

### Control the backend

End-to-end tests that hit a real API fail for reasons that have nothing to do with your app. Point
the build at a dedicated environment, or run a local stub server, and reset its state between flows.
See [Environment Configuration](../build-and-release/environment-configuration.md).

### Reset state between runs

A test that passes only on a fresh install is a test that will fail in CI on the second run.

```text title=Maestro
- launchApp:
    clearState: true
    permissions: {all: allow}
```

```ts-fragment title=Detox
await device.launchApp({newInstance: true, delete: true, permissions: {notifications: 'YES'}});
```

### Keep the suite small and named after the business flow

`sign-in.yaml`, `checkout.yaml`, `deep-link-order.yaml`. When one fails you should know what is
broken from the file name alone.

## Platform differences

:::tabs
@tab iOS
Requires macOS with Xcode and the command line tools. Both tools drive the iOS Simulator; physical
devices need provisioning and add signing to the test pipeline. Permission dialogs are system UI
and must be handled explicitly — Maestro's `permissions` block or Detox's `launchApp({permissions})`.
Maestro's documentation lists the iOS runtimes it supports; check it against the runtime your CI
image ships.
@tab Android
Runs anywhere the Android SDK does, including Linux CI, which makes it much cheaper to run on every
pull request. An emulator with hardware acceleration is dramatically faster than one without — on a
CI runner that usually means an x86-64 system image and a runner that exposes nested virtualisation.
Maestro documents specific supported API levels; pick an emulator image inside that range rather
than the newest one available.
:::

## Performance considerations

- **The build dominates.** A cold native build is minutes; the test run is seconds. Cache Gradle and
  Xcode derived data, and reuse one build across all flows in a run.
- **Boot the device once.** Starting an emulator per test multiplies the slowest step. Boot once,
  run the whole suite, tear down.
- **Run Android on every pull request and iOS on a schedule** if macOS runner minutes are the
  constraint. Most regressions are cross-platform.
- **Shard by flow, not by file size.** End-to-end tests are long and unequal; splitting by count
  leaves one runner doing all the work.
- **Do not add `sleep` to fix a flake.** With Detox it usually means the app is never idle, which is
  worth knowing. With Maestro, prefer raising a specific step's timeout so the intent is recorded.

## Security considerations

**Threat.** End-to-end tests need credentials, and those credentials end up in the repository, in
CI logs, or in a screenshot attached to a failed run.

**Exploit.** A flow that types a real password shows it in Maestro's step screenshots and in
Detox's device logs. Anyone with access to CI artefacts has the account. A test account with
production permissions turns a flaky test into a data-modifying one.

**Fix.**

- Use accounts that exist only in a non-production environment and hold no real data.
- Inject credentials from CI secrets rather than committing them:
  `- inputText: ${E2E_PASSWORD}` in Maestro, `process.env.E2E_PASSWORD` in Detox.
- Point end-to-end builds at a staging API, never production.
- Turn off screenshot and video capture on steps that enter credentials, or mark the field
  `secureTextEntry` so the platform redacts it.

**Verification.** Download the artefacts from a deliberately failed run and grep them:

```bash
grep -ri "password\|bearer \|refresh_token" ./artifacts
```

Anything that comes back is readable by everyone with CI access. See
[Safe Logging in Release Builds](../security/safe-logging.md).

## Common mistakes

- **Installing the wrong `maestro`.** Wrong: `npm install maestro`. That npm package is an unrelated
  AWS Step Functions library. Right: install the CLI from mobile.dev with the curl script, Homebrew
  tap, or the Windows zip.
- **Forgetting Java.** Maestro is a JVM tool and requires Java 17 or newer. The failure at install
  time is a Java error, not a Maestro error, which sends people looking in the wrong place.
- **Expecting iOS tests to run on a Linux runner.** Wrong: adding an iOS Detox configuration to a
  Ubuntu job. Right: an Android job on Linux and an iOS job on macOS. Xcode does not exist on Linux
  and no flag changes that.
- **Adding `sleep` until it passes.** Wrong: a fixed wait before every assertion. Right: find what
  keeps the app busy (Detox) or raise the specific step timeout (Maestro). A fixed sleep makes the
  suite slower and still flaky on a loaded runner.
- **Writing end-to-end tests for validation rules.** Wrong: twelve flows covering every invalid
  email. Right: one flow for the happy path, twelve component tests for the rules. Each end-to-end
  test costs a build and a boot.
- **Reusing one device across runs without clearing state.** Wrong: a flow that depends on being the
  first run after install. Right: `clearState: true` or `delete: true`. Otherwise the second CI run
  fails and everyone blames the runner.
- **Hard-coding a simulator or AVD name that only exists on one machine.** Wrong: `iPhone 15` when
  the CI image ships a different set. Right: create the AVD in the job, or select a device the image
  documents.

## Related topics

- [CI for Mobile](ci-for-mobile.md) — running these suites on hosted runners, including the macOS constraint.
- [React Native Testing Library](testing-library.md) — the cheaper layer that should carry most of your coverage.
- [Jest Setup](jest-setup.md) — Detox runs its tests through Jest.
- [Accessibility APIs](../platform-apis/accessibility.md) — the same labels drive tests and screen readers.
- [Environment Configuration](../build-and-release/environment-configuration.md) — pointing a test build at a non-production backend.
- [Build Variants and Flavours](../build-and-release/build-variants.md) — producing the build the test runs against.
- [Safe Logging in Release Builds](../security/safe-logging.md) — keeping credentials out of artefacts.
