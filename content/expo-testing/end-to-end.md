---
title: End-to-End on Development Builds
description: End-to-end testing an Expo SDK 57 app against a real build of your own binary — not Expo Go — with Maestro locally or on EAS Workflows, and an honest status note on Detox.
status: current
toolchain: expo
sdk: 57
---

End-to-end (E2E) tests drive your real app on an emulator or simulator: launch it, tap, type, and
assert what appears on screen. They are the only automated tests that exercise your actual native
modules, navigation and permissions.

They run against **a build of your own app** — never Expo Go. Expo Go is a different binary with a
fixed set of native modules; a passing E2E run in Expo Go tells you nothing about what you ship.

## Why it exists / when to use it — and when NOT to

Write E2E tests for the handful of flows that must never break: sign in, the core purchase or
creation flow, onboarding, and anything gated by a native permission.

Do **not** try to cover everything with E2E tests. They are slow (a build plus a device boot), and they
fail for reasons unrelated to your change: timing, emulator state, network. Keep logic and component
behaviour in [Jest](jest-expo.md), and a small number of E2E flows on top.

## Expo Go vs development build

**Requires a build of your own app.** Two kinds are useful:

| Build | Contains | Good for |
| --- | --- | --- |
| Development build (`expo-dev-client`) | Your native code, loads JS from Metro | Writing and debugging flows locally |
| Test build with embedded JS (for example the `e2e-test` profile below) | Your native code and bundled JS | CI — no Metro, no dev launcher screen |

A development build opens the dev launcher first, which your flow would have to navigate. For CI, a
build with the JavaScript embedded is simpler and closer to release.

## Basic example

This follows the Maestro setup in Expo's own documentation (docs.expo.dev, "Run E2E tests on EAS
Workflows with Maestro").

### 1. Give elements stable identifiers

```tsx title=app/index.tsx
import {Pressable, Text, View} from 'react-native';

export default function Home() {
  return (
    <View>
      <Text>Welcome!</Text>
      {/* testID becomes the id that Maestro's selectors can match. */}
      <Pressable testID="get-started" role="button" onPress={() => {}}>
        <Text>Get started</Text>
      </Pressable>
    </View>
  );
}
```

### 2. Write a flow

```yaml title=.maestro/home.yml
appId: com.example.myapp
---
- launchApp
- assertVisible: 'Welcome!'
- tapOn:
    id: 'get-started'
```

`appId` is your `android.package` / `ios.bundleIdentifier` from app config.

### 3. Run it locally

Install the Maestro CLI following the official instructions at
[docs.maestro.dev](https://docs.maestro.dev/), install your build on a running emulator or simulator,
then:

```bash
maestro test .maestro/home.yml
```

## How it works

### Building an app to test

Locally, without EAS:

:::tabs
@tab Android
```bash
npx expo run:android --variant release
```
@tab iOS
```bash
# Requires macOS with Xcode. Builds for the simulator.
npx expo run:ios --configuration Release
```
:::

> [!DANGER] `expo run` runs prebuild, which regenerates native directories
> In SDK 57, prebuild **clears and regenerates** `ios/` and `android/` by default. Hand-edits to those
> directories are lost. See [expo prebuild](../expo-core-concepts/prebuild.md).

With EAS Build, Expo's docs use a dedicated profile that needs no signing credentials and produces an
`.apk` and an iOS simulator `.app`:

```json title=eas.json
{
  "build": {
    "e2e-test": {
      "withoutCredentials": true,
      "ios": {
        "simulator": true
      },
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

### Running on EAS Workflows

EAS Workflows has a `maestro` job type that runs flows against a build produced by a `build` job:

```yaml title=.eas/workflows/e2e-test-android.yml
name: e2e-test-android

on:
  pull_request:
    branches: ['*']

jobs:
  build_android_for_e2e:
    type: build
    params:
      platform: android
      profile: e2e-test

  maestro_test:
    needs: [build_android_for_e2e]
    type: maestro
    params:
      build_id: ${{ needs.build_android_for_e2e.outputs.build_id }}
      flow_path: ['.maestro/home.yml']
```

The iOS workflow is the same with `platform: ios`. Run it manually with:

```bash
eas workflow:run .eas/workflows/e2e-test-android.yml
```

> [!NOTE] EAS is a paid service with a free tier
> EAS Workflows and EAS Build need an Expo account, and build and job capacity depend on your plan. This
> handbook does not quote prices or quotas that it cannot verify; see
> [Costs and Limits](../expo-eas/costs-and-limits.md). Running Maestro locally or on your own CI needs
> no Expo account.

## Platform differences

:::tabs
@tab Android
Runs on an Android emulator on macOS, Linux or Windows. Install the `.apk` with
`adb install path/to/app.apk`.
@tab iOS
Needs the iOS Simulator, which **requires macOS with Xcode** — locally and on CI. On EAS Workflows the
macOS machine is provided by EAS.
:::

## Common patterns

### Detox — status on SDK 57

Detox (`20.51.4` on npm) is a grey-box E2E framework that needs native changes to your app. For Expo
projects those changes come from a config plugin, and that is where the status is unclear on SDK 57:

- `@config-plugins/detox` — latest `11.0.0`, declares peer `expo: ^53`. It does not declare SDK 57
  support.
- `expo-detox-config-plugin` — a community-maintained fork, latest `13.0.0`, declares peer
  `expo: >=54.0.0`.

This handbook has **not** verified a Detox setup end to end on SDK 57. Maestro is the tool Expo's own
documentation uses, needs no native changes, and is the recommendation here. If you need Detox, verify
the plugin against your SDK before you depend on it.

### Keep flows independent

Each flow should launch the app from a known state. A flow that depends on the previous one having
signed in fails in confusing ways when run alone or reordered.

## Performance considerations

- The build dominates E2E time. Build once and run every flow against that artefact.
- Use `testID` or accessibility labels for selectors, not visible copy that changes with translation.
- Disable or shorten animations in test builds only if flakiness forces you to; each divergence from
  release reduces what the test proves.

## Common mistakes

- **Running E2E tests in Expo Go.** It is not your app. Build your own binary.
- **Using a development build in CI without handling the dev launcher.** The flow starts on the launcher
  screen, not your app. Use a build with embedded JS.
- **Selecting elements by translated text.** Flows break when copy changes. Use `testID`.
- **Expecting iOS simulator runs on a Linux or Windows runner.** iOS needs macOS.
- **Covering every screen with E2E.** The suite becomes slow and flaky. Test critical flows; push the rest
  down to Jest.
- **Adopting a Detox config plugin without checking its declared Expo peer range.**

## Related topics

- [Why You Need a Development Build](../expo-development-builds/why-you-need-one.md) — why Expo Go is not enough.
- [Creating a Development Build Locally](../expo-development-builds/creating-locally.md) — building without EAS.
- [EAS Workflows](../expo-eas/workflows.md) — the hosted pipeline the Maestro job runs on.
- [Testing in CI](ci.md) — where E2E fits in a pipeline.
- [Jest with jest-expo](jest-expo.md) — the fast tests beneath the E2E layer.
