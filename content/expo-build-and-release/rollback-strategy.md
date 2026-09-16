---
title: Rollback Strategy
description: Planning the undo before an Expo release goes out — rolling back an EAS Update to a previous update or the embedded bundle, why a store binary cannot be rolled back, server-side kill switches, and a minimum-version gate.
status: current
toolchain: expo
sdk: 57
---

A rollback strategy is a written answer to "this release is broken; what do we do in the next ten
minutes?" For an Expo app, the answer depends entirely on **what** is broken:

| What went wrong | Can you roll back? | Fastest safe action |
| --- | --- | --- |
| JavaScript in an EAS Update | **Yes**, in minutes | `eas update:rollback` |
| JavaScript in the store binary's embedded bundle | Partly | Publish a fixed EAS Update to that runtime version |
| Native code, permissions or config in a store binary | **No** | Stop the store rollout; fix forward with a new binary |
| Backend change that breaks old app versions | Yes, on your server | Revert the server, or version the API |
| A feature that misbehaves, in any of the above | Yes, if you built a switch | Turn the feature off server-side |

Plan the actions in the right-hand column before you release. During an incident is too late to
discover that your channel points at the wrong branch or that the previous good update was on another
runtime version.

## Why it exists / when to use it — and when NOT to

Write this plan once per app and review it for each release that changes native code or the runtime
version. Keep it short enough to follow under stress.

Do not treat EAS Update rollback as a safety net for native changes. It cannot deliver or remove
native code.

## Basic example

### Rolling back an EAS Update

```bash
eas update:rollback
```

Expo documents this as an interactive command with two rollback types:

- **To a previously published update** — it re-publishes an earlier update, so clients functionally
  return to it.
- **To the embedded update** — it instructs clients to run the bundle embedded in their build.

After a rollback, publishing again delivers the new update to all clients as normal.

The related commands, all present in the eas-cli 24.5.0 command manifest:

```bash
eas update:republish              # publish an existing update again
eas update:roll-back-to-embedded  # point clients back at the bundle in their binary
eas update:revert-update-rollout  # undo an in-progress per-update rollout
eas update:list --branch production
eas channel:view production
```

Run `eas channel:view production` first during an incident: it shows which branch the channel points
at and the newest update on it, which is what you are about to change.

> [!NOTE] Expo Go vs development build
> Rollbacks apply to builds with `expo-updates` on a channel. Rehearse on a `preview` channel with a
> preview build — Expo Go cannot exercise updates at all.

## How it works

### What an update rollback can reach

Updates are matched to binaries by **runtime version**. A rollback can only return clients to an
update published for **their** runtime version, or to their embedded bundle.

```text
runtime 1.4.0   embedded ── u1 ── u2 ── u3 (bad)
                                    ▲
                    rollback target: u2, or the embedded bundle

runtime 1.5.0   embedded ── u4 (bad)
                  ▲
                  only the embedded bundle — there is no earlier 1.5.0 update
```

The second line is the common surprise: the first update on a new runtime version has nothing to roll
back to except the embedded bundle. That is fine **if** the embedded bundle is good. Know before you
publish.

### Rolling back takes effect at the next update check

Clients pick up a rollback the same way they pick up an update: on a later launch, after checking the
server. A client that downloaded the bad update applies the rollback on a subsequent launch, not
instantly. The faster your users relaunch, the faster the rollback lands.

### Store binaries cannot be rolled back

Neither store lets you return users to a previous binary version:

- **Google Play** — halting a staged rollout stops new recipients; users who already have the version
  remain on it. Google's recommended recovery is a new release with a fixed bundle, which needs a
  higher `versionCode`.
- **App Store** — you can pause a phased release (up to 30 days in total), which stops new automatic
  updates. Users who already have the version keep it, and manual updates remain possible.

So a native regression means: stop the store rollout immediately, then fix forward. If the broken part
is JavaScript running in that binary, an EAS Update to its runtime version is the fastest fix.

### `expo-updates` has its own safety net

`Updates.isEmergencyLaunch` is `true` when `expo-updates` could not launch a downloaded update and fell
back to the embedded bundle. The config types also document `updates.disableAntiBrickingMeasures` —
leave it unset, because it disables the safety behaviour. Track emergency launches in
[Monitoring](monitoring.md); a spike after publishing is a rollback signal on its own.

## Platform differences

:::tabs
@tab iOS
- Pause a phased release in App Store Connect to stop automatic delivery of a bad version.
- A fixed binary goes through App Review again. Build it as soon as the cause is known.
- Building needs macOS with Xcode, or a hosted service such as EAS Build (Expo account; paid with a
  free tier). If your only iOS build path is a single person's Mac, that is a rollback risk.
@tab Android
- Halt the staged rollout in the Play Console.
- A fixed release needs a higher `versionCode`; with `appVersionSource: "remote"` and `autoIncrement`,
  that is automatic.
- Android builds can run locally on Windows, macOS or Linux, which removes a dependency on any one
  build service in an emergency.
:::

## Common patterns

### A server-side kill switch for risky features

The fastest rollback does not ship anything. Guard new features with a flag your server controls:

```ts title=app/lib/flags.ts
type Flags = {newCheckout: boolean};

const DEFAULTS: Flags = {newCheckout: false};

/**
 * Fetches feature flags from our own backend. Any failure returns the safe defaults,
 * so an outage of the flag service turns risky features OFF rather than ON.
 */
export async function fetchFlags(apiUrl: string, signal?: AbortSignal): Promise<Flags> {
  try {
    const res = await fetch(`${apiUrl}/flags`, {signal});
    if (!res.ok) return DEFAULTS;
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'newCheckout' in body) {
      return {newCheckout: (body as {newCheckout: unknown}).newCheckout === true};
    }
    return DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
```

A flag works for store binaries too, which update rollbacks cannot fix. The flag must be in the binary
**before** you need it.

### A minimum-version gate

For the case where a binary is broken beyond what a flag or update can fix — or where an old binary
must stop calling a retired API — let the server declare the minimum supported build:

```tsx title=app/components/MinimumVersionGate.tsx
import * as Application from 'expo-application';
import {useEffect, useState, type ReactNode} from 'react';
import {Button, Linking, Platform, Text, View} from 'react-native';

type Props = {apiUrl: string; children: ReactNode};

const STORE_URL = Platform.select({
  ios: 'https://apps.apple.com/app/id0000000000',
  default: 'https://play.google.com/store/apps/details?id=com.example.myapp',
});

export default function MinimumVersionGate({apiUrl, children}: Props) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`${apiUrl}/min-build`, {signal: controller.signal});
        if (!res.ok) return; // never block users because the check itself failed
        const body = (await res.json()) as {ios?: number; android?: number};
        const minimum = Platform.OS === 'ios' ? body.ios : body.android;
        const current = Number(Application.nativeBuildVersion);
        if (typeof minimum === 'number' && Number.isFinite(current) && current < minimum) {
          setBlocked(true);
        }
      } catch {
        // offline or aborted: let the user in
      }
    })();
    return () => controller.abort();
  }, [apiUrl]);

  if (!blocked) return <>{children}</>;

  return (
    <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12}}>
      <Text>This version is no longer supported. Please update to continue.</Text>
      <Button title="Update" onPress={() => void Linking.openURL(STORE_URL)} />
    </View>
  );
}
```

It compares build numbers because they are integers on Android and, if you keep them numeric, on iOS.
Like a flag, it only helps binaries that already contain it — ship it in your first release.

### Keep the backend compatible with every supported binary

Old binaries stay installed for months. A backend change that removes a field an old version needs is a
rollback you cannot perform on the client side. Version API responses, and remove support only after
the minimum-version gate has moved past the old builds.

### The incident runbook

1. **Identify** the failing slice: binary version, runtime version, update ID. See
   [Monitoring](monitoring.md).
2. **If it is an update:** `eas channel:view production`, then `eas update:rollback`.
3. **If it is a binary:** halt the Play rollout / pause the App Store phased release.
4. **If a flag covers it:** turn it off.
5. **Fix forward:** a new update to the affected runtime version, or a new binary.
6. **Confirm** the failing slice recovers before closing the incident.

Rehearse steps 2–4 on a preview channel once, so nobody runs them for the first time during an
outage.

## Common mistakes

- **Assuming a store binary can be rolled back.** Neither store supports it. Halt or pause, then fix
  forward.
- **Expecting an update rollback to undo a native change.** Updates cannot touch native code.
- **Publishing the first update on a new runtime version without checking the embedded bundle.** The
  embedded bundle is the only rollback target for it.
- **Adding the kill switch or version gate after the incident.** Only binaries that already contain it
  can use it.
- **Setting `disableAntiBrickingMeasures`.** It disables `expo-updates`' own recovery behaviour.
- **Expecting a rollback to land instantly.** Clients apply it on a later launch.
- **A gate that blocks users when the check fails.** Fail open on network errors, or an outage of the
  version endpoint locks everyone out.
- **Removing a backend field old binaries still use.** Keep the API compatible with every build above
  your minimum.

## Related topics

- [Rollouts and Rollbacks](../expo-eas/rollouts-and-rollbacks.md) — EAS Update rollout and rollback mechanics.
- [Staged Rollouts](staged-rollouts.md) — limiting exposure so a rollback affects fewer users.
- [Monitoring](monitoring.md) — the signals that trigger a rollback.
- [Runtime Versions, Channels and Branches](../expo-eas/runtime-versions.md) — why rollback targets are limited by runtime version.
- [Versioning and Runtime Versions](versioning.md) — build numbers the version gate compares.
- [EAS Update Signing](../expo-security/update-signing.md) — rollbacks when updates are signed.
