# Example: minimal-app

The smallest useful React Native **0.87.1** app built with the **React Native
Community CLI**. Every other example in `examples/` assumes you have read this
one, because they all share the same layout, the same config files and the same
"generate the native projects yourself" workflow.

What it demonstrates:

- A 0.87 project on the **New Architecture** (there is no other architecture in
  0.82+ — the old bridge is gone and the architecture flags are ignored).
- The **Strict TypeScript API**: `tsconfig.json` extends
  `@react-native/typescript-config` and does **not** set `customConditions`, so
  deep imports into `react-native/Libraries/*` are type errors.
- A ref typed with the dedicated **`ViewInstance`** type — the removed
  `NativeMethods` type has no replacement other than `HostInstance` and its
  per-component aliases.
- `useColorScheme()` returning `ColorSchemeName | null` (it no longer returns
  `'unspecified'`).
- `StatusBar` with only `barStyle` — `backgroundColor`, `translucent` and
  `networkActivityIndicatorVisible` were removed in 0.87.
- `react-native-safe-area-context` instead of core `SafeAreaView`, which is
  deprecated in 0.87 and warns at runtime. This is also what the official 0.87
  template ships.
- Pure, testable logic in `src/counter.ts` with real Jest tests.

## Layout

```
minimal-app/
  App.tsx                     app root
  index.js                    AppRegistry.registerComponent
  app.json                    app name used by index.js
  src/counter.ts              pure reducer + formatter (unit tested)
  src/useCounter.ts           React wrapper around the reducer
  src/theme.ts                light/dark palette
  src/components/CounterCard.tsx   ViewInstance ref + measureInWindow
  __tests__/                  Jest tests
```

There is deliberately **no `android/` or `ios/` folder** here. A correct 0.87
native project is thousands of generated lines (Gradle wrapper, Podfile,
`.pbxproj`, keystores, icon sets) and hand-writing one produces a project that
does not build. Generate it with the CLI instead — see below.

## Step 1 — requirements

- **Node >= 22.13.0** (this is `react-native@0.87.1`'s own `engines` floor).
  Check with `node -v`.
- JDK 17+, Android Studio with **compileSdk 37** and an emulator or a device
  with USB debugging, for Android.
- **iOS builds require macOS with Xcode.** There is no way to build or run the
  iOS app on Windows or Linux. Everything below marked iOS assumes a Mac.

## Step 2 — create the native projects

```bash
npx @react-native-community/cli@20.2.0 init MinimalApp --version 0.87.1
```

Answer the prompts, then copy this example's JS/TS source over the generated
project:

```bash
cp -R examples/minimal-app/App.tsx      MinimalApp/
cp -R examples/minimal-app/index.js     MinimalApp/
cp -R examples/minimal-app/app.json     MinimalApp/
cp -R examples/minimal-app/src          MinimalApp/
cp -R examples/minimal-app/__tests__    MinimalApp/
cp    examples/minimal-app/jest.config.js MinimalApp/
cp    examples/minimal-app/tsconfig.json  MinimalApp/
```

On Windows PowerShell use `Copy-Item -Recurse -Force` instead of `cp -R`.

The generated `app.json` will contain the name you typed at `init`. Either keep
the generated `app.json` **and** change the `name` in this example's
`app.json`, or keep this one and rename the Android/iOS app accordingly — the
string passed to `AppRegistry.registerComponent` must match the name the native
side registers. If they differ you get a red screen reading
`"MinimalApp" has not been registered`.

`init` already installs `react`, `react-native` and
`react-native-safe-area-context`. Pin the version this example expects:

```bash
npm install react-native-safe-area-context@5.9.1 --legacy-peer-deps
```

`react-native-safe-area-context` is autolinked — there is no manual native
configuration for it on either platform. On iOS re-run
`bundle exec pod install` after installing it.

## Step 3 — install and check the JS

From inside `examples/minimal-app` (or from the copied project):

```bash
npm install --legacy-peer-deps
npx tsc --noEmit      # or: npm run tsc
npm test
```

`npm test` runs five Jest suites' worth of assertions over the reducer, the
formatter, the theme and a full render of `App.tsx`.

## Step 4 — run it

Start Metro in one terminal:

```bash
npm start
```

### Android (Windows, macOS or Linux)

```bash
npm run android
```

### iOS (macOS only)

```bash
cd ios && bundle install && bundle exec pod install && cd ..
npm run ios
```

CocoaPods is still the default in 0.87. The Swift Package Manager path
(`npx react-native spm`) is experimental.

## What you should see

A single scrolling screen on a light or dark background that follows the system
appearance:

1. The heading **Minimal App** and the subtitle
   "React Native 0.87.1 · New Architecture · Strict TypeScript API".
2. A card showing **Count 0**, **Step size: 1**, and four buttons:
   `-`, `+`, `Reset`, `Measure`.
3. Three pills reading `step 1`, `step 5`, `step 25`. Tapping one highlights it
   and changes how much `+` and `-` move the count.
4. Under the card, the line
   "Press "Measure" to read the card height through a ViewInstance ref."
   Tapping **Measure** replaces it with
   "Card height measured natively: 2xxdp" — the exact number depends on the
   device's font scale and density. That number comes from the native view, via
   `measureInWindow` on a `ViewInstance` ref, so it proves the New Architecture
   host view is wired up.
5. A **History (newest first)** list that grows as you tap, capped at 10 values.

Switch your device between light and dark mode with the app open: the
background, text and accent colours change immediately.

## Step 5 — a real release bundle

```bash
npm run bundle:android
```

This runs the real Metro bundle command:

```
react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res
```

It writes into `android/app/src/main/assets/`, creating the folders if they do
not exist, so it runs even in this source-only folder — but the bundle is only
useful inside a real native project, so run it from the project you generated
in step 2.

Metro prints one warning during the bundle:

```
WARN Attempted to import the module ".../react-native/src/private/featureflags/
ReactNativeFeatureFlags" which is not listed in the "exports" of "react-native"
```

That comes from a dependency reaching into React Native's private feature-flag
module, which moved to private API in 0.82. It is a warning, not a failure —
Metro falls back to file-based resolution and the bundle is produced.

## Things that will bite you

- **A stale global CLI.** Run
  `npm uninstall -g react-native-cli @react-native-community/cli` before
  anything else; a global binary shadows the local one and reports confusing
  version errors.
- **Node 20.** 0.87 requires 22.13.0 or newer. On Node 20 the CLI fails in ways
  that look like unrelated Metro errors.
- **Deep imports.** `import X from 'react-native/Libraries/...'` compiles in
  older projects and is a type error here. That is intentional; import from
  `'react-native'` instead.
- **`npm install` without `--legacy-peer-deps`.** Several React Native
  ecosystem packages still declare peer ranges that npm 10's strict resolver
  rejects. This example has no third-party dependencies, so plain
  `npm install` works here — the other examples need the flag.
