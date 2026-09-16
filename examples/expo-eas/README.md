# Example: expo-eas

A complete `eas.json` with **development**, **preview** and **production** profiles. It is
validated against the schema eas-cli itself uses, with no Expo account and no cloud build.

> **Toolchain:** Expo SDK 57 · React Native **0.86.3** · eas-cli **24.5.0** · the app runs in
> **Expo Go**; the `development` profile produces a development build.

## Costs, plainly

EAS (Build, Submit, Update, Workflows) is a **paid hosted service with a free tier**. Build
queues and concurrency depend on your plan, and current prices and quotas are published on
expo.dev/pricing. They change, so none are quoted here. You need an Expo account to run any EAS
command.

**EAS is not required to ship an Expo app.** Local builds are a supported alternative:
`npx expo run:android` / `run:ios` for a native build, or `eas build --local` to run an EAS
profile on your own machine.

Nothing in this example logs in or starts a build.

## The profiles

```json
"build": {
  "development": { "developmentClient": true, "distribution": "internal", "channel": "development" },
  "preview":     { "distribution": "internal", "channel": "preview", "android": { "buildType": "apk" } },
  "production":  { "channel": "production", "autoIncrement": true }
}
```

| Profile | What it produces | Why |
| --- | --- | --- |
| `development` | A development build (includes `expo-dev-client`), internal distribution | The build you develop against once Expo Go stops being enough |
| `preview` | An installable release-like build; Android as an **APK** | APKs sideload onto test devices; store builds (AAB) do not |
| `production` | A store build; `distribution` resolves to `store` | What goes to the App Store and Play Store |

Other settings:

- **`channel`** on each profile ties that build to an EAS Update channel, so an update published
  to `preview` reaches only preview builds.
- **`cli.appVersionSource: "remote"`** keeps build numbers on EAS's servers.
  **`autoIncrement: true`** bumps them on each production build, so two builds never collide on
  a version code.
- **`env`** sets `APP_VARIANT` per profile. It is readable at build time, for example by
  `app.config.ts`.

> [!WARNING]
> Values in a profile's `env` end up wherever your build puts them. If your code reads one
> through an `EXPO_PUBLIC_` variable, it is inlined into the JS bundle and anyone with the app
> can read it. See [expo-public-leak](../expo-public-leak/README.md), which demonstrates exactly
> that. Build-time variables keep a value out of your repository, not out of your app.

`app.json` sets `"runtimeVersion": { "policy": "appVersion" }`. The installed
`@expo/config-types` accepts `nativeVersion`, `sdkVersion`, `appVersion` and `fingerprint`. A
runtime version marks which native binary an OTA update is compatible with. Shipping an update
to a binary with a different runtime is the classic way to crash users.

## Validation without an account

`scripts/validate-eas-json.mjs` reads `eas.json` through `@expo/eas-json` (`EasJsonAccessor` and
`EasJsonUtils`). That is the package eas-cli uses, so it runs the same schema validation and
profile resolution a real `eas build` would. Real output from this machine:

```text
build profiles: development, preview, production
  OK   development  android  {"distribution":"internal","developmentClient":true,"channel":"development",…}
  OK   development  ios      {"distribution":"internal","developmentClient":true,"channel":"development",…}
  OK   preview      android  {"distribution":"internal",…,"channel":"preview","buildType":"apk",…}
  OK   preview      ios      {"distribution":"internal",…,"channel":"preview",…}
  OK   production   android  {"distribution":"store",…,"channel":"production","autoIncrement":true,…}
  OK   production   ios      {"distribution":"store",…,"channel":"production","autoIncrement":true,…}

submit profiles: production
  OK   production   android
  OK   production   ios

eas.json: OK
```

It also **fails** when it should. Both of these negative controls were run, and `eas.json` was
restored afterwards:

```text
# "distribution" misspelled as "distrbution"
eas.json could not be read: eas.json is not valid.
- "build.development.distrbution" is not allowed
- "build.preview.distrbution" is not allowed

# "buildType": "exe"
eas.json could not be read: eas.json is not valid.
- "build.preview.android.buildType" must be one of [apk, app-bundle]
```

Without the negative controls, `eas.json: OK` would prove nothing. A validator that accepted
everything would print the same line.

`@expo/eas-json` is pinned at **24.5.0**, the exact version eas-cli 24.5.0 declares as its own
dependency (read from eas-cli 24.5.0's published `package.json`). The validator therefore runs
the same schema eas-cli would. What it cannot check is anything server-side, such as whether your
account can use a given `resourceClass` or whether your credentials exist. Run
`eas build --profile <name>` once with an account before relying on a profile in CI.

## Run it

```bash
npm install
```

```bash
npm run validate:eas
```

With an Expo account, these are the real commands. They were **not run** here.

```bash
eas build --profile development --platform android
```

```bash
eas build --profile preview --platform android
```

```bash
eas build --profile production --platform all
```

## Verify

These were run on this project on Windows with Node 22.13.0:

| Check | Result |
| --- | --- |
| `npm run tsc` | exit 0 |
| `npm run check-deps` | `Dependencies are up to date` |
| `npm run config:public` | resolves; `sdkVersion: 57.0.0`, `runtimeVersion: {"policy":"appVersion"}` |
| `npm run validate:eas` | 6 build profile/platform combinations and 2 submit combinations OK; 2 negative controls rejected |
| `npm run export` | **580 modules** → `index-*.hbc` **1.4 MB** |

**NOT RUN:** any `eas` command that needs an account, including `eas build`, `eas submit`,
`eas update` and credentials management. No Expo account was created or used.

## Related reading

- [eas.json and Build Profiles](../../content/expo-eas/eas-json.md)
- [Runtime Versions, Channels and Branches](../../content/expo-eas/runtime-versions.md)
- [Building Locally](../../content/expo-eas/local-builds.md)
- [Costs and Limits](../../content/expo-eas/costs-and-limits.md)
