# Example: expo-dev-build

Proves why **Expo Go is not enough** for a real app, using a library with custom native code,
and walks through the development build that fixes it.

> **Toolchain:** Expo SDK 57 · React Native **0.86.3** · expo-dev-client ~57.0.19 · **requires
> a development build**. In Expo Go it deliberately shows an explanation instead of the feature.

## The library that breaks Expo Go

`react-native-mmkv` 4.3.2 is built on **Nitro Modules** (`react-native-nitro-modules` 0.37.1).
Both contain custom native code:

- **Neither is in the SDK 57 version map** (`expo/bundledNativeModules.json`), so `npx expo
  install` falls back to the npm latest version for them.
- **Neither is inside Expo Go.** Expo Go's binary is fixed and cannot gain native code from your
  `package.json`.

Nitro's JS side reaches its native half with
`TurboModuleRegistry.getEnforcing<Spec>('NitroModules')`
(read from `react-native-nitro-modules/src/turbomodule/NativeNitroModules.ts`). `getEnforcing`
**throws** when the module isn't in the binary. In Expo Go, importing MMKV therefore fails
during module initialisation, before your app renders anything.

## How the app handles it

`App.tsx` asks whether the native module is actually linked:

```tsx
const nitroIsLinked = requireOptionalNativeModule('NitroModules') !== null;
```

- `requireOptionalNativeModule` (exported from `expo`) returns `null` instead of throwing.
- Only if Nitro is linked does the app `require('react-native-mmkv')`, then call
  `createMMKV({id: 'expo-dev-build-example'})` and persist a tap counter.
- `isRunningInExpoGo()` (also from `expo`) is used only to word the explanation.

> [!WARNING] The check that looks right and is wrong
> `Constants.executionEnvironment === 'storeClient'` is **not** a way to detect Expo Go. The
> installed expo-constants types document `StoreClient` as *"Expo Go or a development build
> built with expo-dev-client"*. Using it would block the development build too, which is the
> one environment where this library works.

## Decision table

| You need… | Expo Go | Development build |
| --- | --- | --- |
| Only packages in the SDK 57 set Expo Go ships | works | works |
| Any library with custom native code (`react-native-mmkv`, Nitro, most community native libs) | **fails at runtime** | works |
| A local Expo module or TurboModule | **fails** | works |
| A config plugin's native change (permissions, manifest, Info.plist) | not applied | applied |
| Your own app icon, bundle id, or deep-link scheme | no | yes |

## Run it

```bash
npm install
```

Build and install the development build. It generates `android/` because the folder is missing,
compiles the native code including MMKV and Nitro, and installs the app:

```bash
npx expo run:android
```

iOS is `npx expo run:ios` and requires **macOS with Xcode**. You can also build on EAS with a
`developmentClient: true` profile (see [expo-eas](../expo-eas/README.md)). That needs an Expo
account, and EAS is a paid service with a free tier.

Then start the dev server for the development build:

```bash
npm start
```

That runs `expo start --dev-client`. To watch Expo Go fail instead, run `npm run start:go` and
open the project in Expo Go.

## Verify

These were run on this project on Windows with Node 22.13.0:

| Check | Result |
| --- | --- |
| `npm run tsc` | exit 0 |
| `npm run check-deps` | `Dependencies are up to date` |
| `npm run config:public` | resolves; `sdkVersion: 57.0.0`, plugins `["expo-dev-client"]` |
| autolinking (`expo-modules-autolinking react-native-config --platform android`) | finds `react-native-mmkv` and `react-native-nitro-modules` |
| `npm run export` | **616 modules** → `index-*.hbc` **1.5 MB** |

`npm run export` bundles only the JavaScript, so it proves the app **compiles**, not that the
native side links.

**NOT RUN on this host:**

- **`npx expo run:android`:** the Android SDK installed here does not provide the platform
  versions a current build targets, so no APK was built.
- **`npx expo run:ios`:** needs macOS.
- **The on-device Expo Go failure:** it was not reproduced on a device. The failure mechanism
  above is read from Nitro's source, not captured from a screen.

## Related reading

- [Expo Go vs Development Builds](../../content/expo-core-concepts/expo-go-vs-development-builds.md)
- [Why You Need a Development Build](../../content/expo-development-builds/why-you-need-one.md)
- [Adding Native Dependencies](../../content/expo-development-builds/adding-native-dependencies.md)
