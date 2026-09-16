---
title: Runtime Versions, Channels and Branches
description: The runtime version identifies the native binary an update is compatible with; channels are fixed into builds and branches hold updates. How the four runtime version policies work, and how channels point at branches.
status: current
toolchain: expo
sdk: 57
---

Three names decide which update an installed app receives:

| Name | Where it lives | What it answers |
| --- | --- | --- |
| **Runtime version** | Fixed into the binary at build time, and attached to every update | *Is this update compatible with this binary's native code?* |
| **Channel** | Fixed into the binary at build time | *Which stream of updates does this build listen to?* |
| **Branch** | On the update server | *Which ordered list of updates is this?* A channel points at a branch |

A build receives the newest update on the branch its channel points at, **among updates whose runtime
version matches the build's own**. Nothing else is served to it.

The runtime version is the safety mechanism. It is the only thing that stops an update built against
one set of native code from running on a binary that has different native code.

Config names were read from the installed `@expo/config-types` for SDK 57 and `expo-updates@57.0.22`;
commands from the `eas-cli` **24.5.0** command manifest.

> [!NOTE] Expo Go vs development build
> `expo-updates` is native, and the channel logic applies to builds that have a channel. The installed
> `expo-updates` types say `Updates.channel` is always `null` in Expo Go and development builds, which
> can run any update compatible with their native runtime. Test channel behaviour on a `preview` or
> `production` build.

## Why it exists / when to use it — and when NOT to

Every app that uses EAS Update needs a runtime version; there is no opting out. The decision you make is
**which policy** produces it, and that decision determines how likely you are to ship an incompatible
update.

Channels and branches exist so that one binary can be pointed at different streams of updates without
rebuilding — staging builds at staging updates, a production channel moved to a new branch during a
rollout, or back to an old branch in an incident.

## Basic example

```json title=app.json
{
  "expo": {
    "version": "1.4.0",
    "runtimeVersion": {
      "policy": "fingerprint"
    },
    "updates": {
      "url": "https://u.expo.dev/your-project-id"
    }
  }
}
```

```json title=eas.json
{
  "cli": {"version": ">= 24.5.0"},
  "build": {
    "production": {
      "channel": "production"
    }
  }
}
```

```bash
# The build records its runtime version and channel.
eas build --platform all --profile production

# The update records the runtime version computed from the project at publish time.
eas update --branch production --message "fix empty cart state"
```

If the native code has not changed between the build and the update, the two runtime versions match and
the build receives the update. If it has, they differ, and the update is not offered to that
build.

## How it works

### The runtime version

`runtimeVersion` in the SDK 57 app config type accepts either a string or an object with a `policy`:

```json title=app.json
{
  "expo": {
    "runtimeVersion": "1.4.0-native-3"
  }
}
```

It can also be set per platform, as `ios.runtimeVersion` and `android.runtimeVersion`; a platform value
overrides the top-level one on that platform.

### The four policies

The `policy` values in the SDK 57 type are exactly `appVersion`, `nativeVersion`, `fingerprint` and
`sdkVersion`.

| Policy | Runtime version becomes | Changes when | Risk |
| --- | --- | --- | --- |
| `fingerprint` | A hash of the project's native-relevant sources, computed by `@expo/fingerprint` | Anything that feeds the fingerprint changes | Low for incompatibility; may create new runtimes you did not strictly need |
| `appVersion` | The app's `version` | You change `version` | **High** if you change native code without bumping `version` |
| `nativeVersion` | `version` combined with `ios.buildNumber` / `android.versionCode` | Either changes | Can diverge between platforms if their build numbers differ |
| `sdkVersion` | Derived from the Expo SDK version | You upgrade the SDK | **High** — native changes within one SDK do not change it |
| A string | Exactly what you wrote | You edit it | Entirely on you |

Expo's `expo-updates` documentation describes `fingerprint` as working for projects with and without
custom native code, and as automatically accounting for SDK upgrades and added native code. The
`appVersion` policy, by the same documentation, requires you to update `version` manually for every
public release.

> [!WARNING] `appVersion` and a string only work if a human remembers
> With `appVersion`, a native change that ships without a `version` bump produces builds and updates that
> share a runtime version while having different native code. Updates published after the change reach the
> old binaries and fail when they call native code those binaries lack. Prefer `fingerprint` unless you
> have a specific reason and a review step that enforces the bump.

### What the fingerprint hashes

The installed `@expo/fingerprint` is **0.20.13**. From its type definitions:

- The **resolved app config** is a source. The skip flags available for it — versions, names, package
  name, bundle identifier, schemes, EAS project info, assets, the `extra` section, or the whole config —
  exist precisely because those values normally change the hash. The type's own comment on skipping the
  whole config warns that doing so can miss real native changes such as adding a config plugin or
  changing the app icon.
- **`package.json` scripts** are a source. The default skip set is exactly one flag: `android` and `ios`
  scripts that do not contain `run`, because prebuild rewrites those.
- **Native files** are hashed, with default ignore paths for build output and caches — `android/build`,
  `.gradle` and `.cxx` directories, `ios/Pods`, `ios/build`, user-specific Xcode data, `.DS_Store` — and
  the raw `app.json` / `app.config.*` files, which are covered by the resolved-config source instead.

A `fingerprint.config.js` at the project root can adjust `ignorePaths`, `extraSources`, `sourceSkips`,
`hashAlgorithm`, `concurrentIoLimit`, `enableReactImportsPatcher`, `useRNCoreAutolinkingFromExpo`,
`debug` and `fileHookTransform` — those are the keys of the `Config` type. Changing them changes which
builds are considered compatible, so treat edits to that file like native changes.

### Seeing the fingerprint

```bash
# Generate the fingerprint for the current project
eas fingerprint:generate --platform android

# Compare the current project against an existing build or update
eas fingerprint:compare --build-id <build-id>
eas fingerprint:compare --update-id <update-id>

# Compare two hashes directly
eas fingerprint:compare <hash1> <hash2>
```

`fingerprint:generate` also accepts `--build-profile` and `--environment`. When an update unexpectedly
does not reach a build, `fingerprint:compare` against that build tells you which source differs.

### Channels

A channel is a name compiled into the binary, set by the `channel` field of the build profile in
`eas.json`. It does not change after the build. The binary sends it with every update request.

```bash
eas channel:list
eas channel:view production
eas channel:create staging
```

### Branches

A branch is an ordered list of updates on the server. `eas update --branch <name>` publishes to it,
creating the branch if it does not exist.

```bash
eas branch:list
eas branch:view production
eas update:list --branch production --runtime-version 1.4.0
```

### Linking a channel to a branch

A channel normally points at one branch. What creates the link, read from the eas-cli 24.5.0 source:

- `eas update --branch <name>` makes sure the **branch** exists, creating it if needed. It does not create
  or link a channel.
- `eas update --channel <name>`, when that channel does not exist or has no branch, creates a branch with
  the same name and a channel linked to it. If the channel is linked to more than one branch — during a
  branch rollout — the command refuses and tells you to use `--branch`.

Whether other commands create channels for you was not verified for this page. Check with
`eas channel:view <name>` rather than assuming, and create or re-point channels explicitly. Re-pointing
needs no rebuild:

```bash
# Every production build now receives updates from the hotfix-1-4 branch
eas channel:edit production --branch hotfix-1-4
```

`eas update --channel production` publishes to whichever branch the channel is currently linked to.

Two more channel controls exist in eas-cli 24.5.0: `eas channel:pause` stops a channel from sending
updates and `eas channel:resume` starts it again, and `eas channel:protect` restricts publishing to
account admins.

### Reading them in the app

```tsx title=src/UpdateInfo.tsx
import * as Updates from 'expo-updates';
import {StyleSheet, Text, View} from 'react-native';

// A debug screen that answers "what is this device running?" during an incident.
export default function UpdateInfo() {
  return (
    <View style={styles.container}>
      <Text>Runtime version: {Updates.runtimeVersion ?? 'none'}</Text>
      {/* null in Expo Go and development builds, by the expo-updates types */}
      <Text>Channel: {Updates.channel ?? 'none'}</Text>
      <Text>
        Update: {Updates.isEmbeddedLaunch ? 'embedded bundle' : (Updates.updateId ?? 'unknown')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {padding: 16, gap: 4},
});
```

## Platform differences

:::tabs
@tab Android
`nativeVersion` combines `version` with `android.versionCode`. If Android and iOS build numbers move
independently, the two platforms end up on different runtime versions, which is correct but likely to
misread in `eas update:list`.
@tab iOS
`nativeVersion` combines `version` with `ios.buildNumber`. The fingerprint includes native iOS sources,
so a CocoaPods-affecting change such as a new pod changes the iOS fingerprint.
:::

A fingerprint is computed per platform, and a change that only affects one platform's native code can
change only that platform's runtime version.

## Common patterns

### Name channels after environments, branches after streams

```json title=eas.json
{
  "build": {
    "preview": {"distribution": "internal", "channel": "preview"},
    "production": {"channel": "production"}
  }
}
```

Keep channel and branch names identical by default, and deviate only deliberately — re-pointing a channel
is the mechanism behind branch rollouts and emergency switches.

### Promote tested updates between branches

Publish to `preview`, test on a preview build, then copy the exact update to production with
`eas update:republish --branch preview --destination-branch production`. The production bytes are then the
tested bytes. See [Rollouts and Rollbacks](rollouts-and-rollbacks.md).

### Check compatibility in CI before publishing

Run `eas fingerprint:compare --build-id <latest production build>` before `eas update`. If the fingerprints
differ, the update will not reach that build — which is correct, but usually means someone expected a
native change to ship by update.

## Common mistakes

- **Forcing an update onto an old runtime version.** Setting a string runtime version back to an old value
  to reach older binaries sends new JavaScript to native code that may lack what it calls, and it crashes.
- **Using `appVersion` and not bumping `version` after a native change.** Updates reach binaries they are not
  compatible with.
- **Building without a `channel`.** The binary has nothing to ask for. The channel cannot be added later.
- **Expecting `eas channel:edit` to change a runtime version.** It changes which branch a channel follows;
  runtime version matching still applies.
- **Assuming `fingerprint` changes only on native code.** App names, icons, schemes and `extra` values in the
  resolved config are sources by default, so they create a new runtime version too.
- **Editing `fingerprint.config.js` casually.** It changes which builds are treated as compatible.
- **Testing channel behaviour in a development build.** Its channel is `null`.

## Related topics

- [EAS Update](update.md) — publishing updates.
- [Rollouts and Rollbacks](rollouts-and-rollbacks.md) — using channels and branches during a release.
- [What OTA Updates May Not Change](ota-limits-and-policy.md) — why the runtime version must track native code.
- [eas.json and Build Profiles](eas-json.md) — where `channel` is set.
- [Versioning and Runtime Versions](../expo-build-and-release/versioning.md) — app versions and build numbers.
- [Upgrading the SDK](../expo-migration/upgrading-sdk.md) — the change that always needs a new runtime version.
