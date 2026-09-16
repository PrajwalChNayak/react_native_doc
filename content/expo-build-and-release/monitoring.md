---
title: Monitoring
description: Knowing whether an Expo release is healthy — crash and error reporting with readable stack traces, which binary and update each report came from, update adoption, and the signals that decide a rollout.
status: current
toolchain: expo
sdk: 57
---

Monitoring a mobile release answers four questions, and you want each answer within minutes of a
problem starting, not from a one-star review:

1. **Is it crashing?** Native crashes and fatal JavaScript errors.
2. **Is it erroring?** Handled errors, failed requests, broken screens that did not crash.
3. **Which build is it?** Binary version, build number, runtime version, update ID and channel.
4. **Who has it?** How far a binary or an update has actually spread.

Without the third answer, the first two are close to useless for an app that ships JavaScript
updates: the same binary version can be running several different bundles.

## Why it exists / when to use it — and when NOT to

Set monitoring up **before** your first staged rollout. A rollout without it is a slow full release.

Collect what you need to find and fix problems. Monitoring SDKs collect device and usage data, which
you must disclose in App Store privacy answers and the Play Data safety form — see
[App Store Metadata](store-metadata.md). Do not send tokens, passwords or personal content in error
reports.

## Basic example

### Tag every report with the build and the update

Whatever reporting tool you use, attach these values to every event. All of them are verified exports
of the installed SDK 57 packages:

```ts title=app/lib/release-context.ts
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';

export type ReleaseContext = {
  appVersion: string | null;
  buildNumber: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  updateId: string | null;
  isEmbeddedLaunch: boolean;
  isEmergencyLaunch: boolean;
};

/**
 * The identifiers that let you tell "1.5.0 running its embedded bundle" apart from
 * "1.5.0 running update abc123", which fail in different ways.
 */
export function releaseContext(): ReleaseContext {
  return {
    appVersion: Application.nativeApplicationVersion,
    buildNumber: Application.nativeBuildVersion,
    runtimeVersion: Updates.runtimeVersion,
    channel: Updates.channel,
    updateId: Updates.updateId,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    // True when expo-updates fell back to the embedded bundle because the downloaded update
    // failed to launch. A rising count of these right after publishing is a strong rollback signal.
    isEmergencyLaunch: Updates.isEmergencyLaunch,
  };
}
```

### A crash and error reporter

Expo does not ship its own crash reporter. A common choice is Sentry, whose React Native SDK is in the
SDK 57 native module map:

```bash
npx expo install @sentry/react-native
```

On SDK 57 that resolves **`~7.11.0`**. The `latest` tag on npm is a newer major version (8.26.0 at the
time of writing), so a bare package-manager install would fetch a version SDK 57 does not pin — use
`npx expo install`.

```tsx-fragment title=app/_layout.tsx
import * as Sentry from '@sentry/react-native';
import {Stack} from 'expo-router';
import {releaseContext} from './lib/release-context';

const release = releaseContext();

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN, // a DSN is designed to be public
});
Sentry.setTags({
  runtimeVersion: release.runtimeVersion ?? 'none',
  channel: release.channel ?? 'none',
  updateId: release.updateId ?? 'embedded',
  emergencyLaunch: String(release.isEmergencyLaunch),
});

function RootLayout() {
  return <Stack />;
}

export default Sentry.wrap(RootLayout);
```

This block is a fragment: `@sentry/react-native` is not installed in this site's type-check harness,
so the calls above were not compiled here. `init`, `setTags` and `wrap` are the entry points named in
Sentry's own Expo guide. Sentry's guide also configures a config plugin
(`@sentry/react-native/expo`) and a Metro helper (`getSentryExpoConfig` from
`@sentry/react-native/metro`) for source map upload; that guide is written against its current major
version, so follow it and check each step against the `~7.11.0` version SDK 57 installs.

> [!NOTE] Expo Go vs development build
> Crash reporters include native code to capture native crashes and need a
> [development build](../expo-development-builds/why-you-need-one.md). `expo-application` and
> `expo-updates` values in Expo Go describe Expo Go, not your app. Verify reporting from a **release**
> build.

## How it works

### Stack traces need source maps

A release bundle is minified and compiled to Hermes bytecode. A stack trace from it points at
bytecode offsets, not your files. To read it, the reporting service needs the **source maps for that
exact bundle**:

- For a store build, the maps for the embedded bundle.
- For **each EAS Update**, the maps for that update's bundle. `eas update` accepts `--source-maps` to
  emit them (verified flag).

An update published without matching source maps produces unreadable stack traces for everyone who
receives it. Check with a deliberate test error from a preview update before you rely on it.

### Crash-free rate by release, not overall

An overall crash-free percentage hides a bad release behind the good ones. Always slice by:

- binary version and build number, and
- update ID (or "embedded").

A regression in update `abc123` shows up clearly in its own slice while the app-wide rate barely moves.

### Update adoption and launch data

Two sources describe how far a release has spread:

| Source | What it tells you | Notes |
| --- | --- | --- |
| EAS Insights, app usage | Usage across platforms, app store versions and time | Expo documents it as aggregated from EAS Update requests and the `expo-insights` library |
| `expo-insights` (`~57.0.17` on SDK 57) | More precise launch data | Expo documents it as in preview, limited to events about cold starts, and currently free |
| `eas update:insights` | Insights for a published update | A verified eas-cli 24.5.0 command |

None of these is a crash reporter. Use them to answer "how many users have this yet", which decides
whether a quiet error dashboard means "healthy" or "nobody has it".

### On-device update logs

`expo-updates` keeps a log you can read from JavaScript. That is valuable when an update is not
applying on a specific device:

```ts title=app/lib/update-logs.ts
import * as Updates from 'expo-updates';

/** Returns recent expo-updates log messages, newest last, for a support or debug screen. */
export async function recentUpdateLogs(): Promise<string[]> {
  // maxAge is in milliseconds; one hour here.
  const entries = await Updates.readLogEntriesAsync(60 * 60 * 1000);
  return entries.map((entry) => `${new Date(entry.timestamp).toISOString()} ${entry.message}`);
}
```

Expose it behind a debug menu or attach it to a user-initiated bug report. Do not upload it
automatically without checking what it contains.

## Platform differences

:::tabs
@tab iOS
- App Store Connect and Xcode Organizer show crash reports for store and TestFlight builds, with a
  delay and only from users who share diagnostics.
- Symbolicating native iOS crashes needs the dSYM files for the build.
@tab Android
- The Google Play Console shows crashes and ANRs (app not responding) for store builds.
- ANRs are not crashes and do not appear in every crash reporter by default; check the Play Console
  vitals even if your reporter is quiet.
- Native crashes from R8-processed code need the mapping file for that build.
:::

## Common patterns

### Rollout gate: compare the new slice with the previous one

For each stage of a [staged rollout](staged-rollouts.md), compare the new release's slice against the
previous release over the same period of time:

| Signal | Source | Stop the rollout if |
| --- | --- | --- |
| Crash-free sessions | Crash reporter, by update ID | Measurably worse than the previous update |
| Emergency launches | `isEmergencyLaunch` tag | Any sustained increase |
| Top new error | Crash reporter | A new error in a key flow (sign-in, checkout) |
| API error rate from app clients | Your backend, by app version header | Increase from the new version |
| Adoption | EAS Insights / update insights | Too low to judge — wait before widening |

### Send the release context to your own API

Add `appVersion`, `runtimeVersion` and `updateId` as request headers from the app. Your backend logs
then answer "which clients are calling this deprecated endpoint", which you need before retiring it.

### Test the pipeline with a deliberate error

After configuring a reporter, ship a preview update containing a button that throws, press it on a
release build, and confirm the event arrives with a readable stack trace and the right update ID.
Remove the button afterwards.

## Common mistakes

- **Reporting without update IDs.** Every JavaScript regression looks like it belongs to the binary
  version. Tag `updateId` and `runtimeVersion`.
- **Publishing updates without source maps.** Stack traces from that update are unreadable. Use
  `--source-maps` and upload them.
- **Installing the reporter with a bare package-manager install.** You get a major version SDK 57
  does not pin. Use `npx expo install`.
- **Watching the overall crash-free rate.** It hides a bad release. Slice by release.
- **Reading a quiet dashboard as healthy when adoption is low.** Check how many users have the release.
- **Putting personal data or tokens into error context.** Crash reports are stored by a third party
  and viewed by your team.
- **Ignoring ANRs on Android.** Check Play Console vitals as well as your reporter.
- **Verifying monitoring in Expo Go or a dev build.** Confirm from a release build.

## Related topics

- [Staged Rollouts](staged-rollouts.md) — the decisions monitoring feeds.
- [Rollback Strategy](rollback-strategy.md) — what to do when a signal fires.
- [EAS Update](../expo-eas/update.md) — `--source-maps` and the `Updates` API.
- [Versioning and Runtime Versions](versioning.md) — the identifiers to tag reports with.
- [App Store Metadata](store-metadata.md) — disclosing what monitoring SDKs collect.
- [Error Boundaries](../expo-router/error-boundaries.md) — catching render errors per route.
