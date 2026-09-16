---
title: EAS Update
description: Shipping JavaScript and asset changes to installed apps with expo-updates — setup, the publish commands, the client API, and the compatibility rule that keeps it safe.
status: current
toolchain: expo
sdk: 57
---

EAS Update delivers a new **JavaScript bundle and assets** to an app that is already installed, so a
fix can reach users without a new binary and a store review. The client half is `expo-updates`
(SDK 57 ships `~57.0.22`); the server half is EAS Update, which is a paid hosted service with a free
tier.

The single most important fact on this page: an update is matched to a build by **runtime version**.
Publishing an update to a runtime that does not match the installed binary is how production apps
get broken. That mechanism has its own page —
[Runtime Versions, Channels and Branches](runtime-versions.md) — and you should read it before you
publish anything to users.

## Why it exists / when to use it — and when NOT to

Use it for JavaScript-level fixes with a short fuse: a crash on a specific screen, a wrong string, a
broken API call, a feature flag you need off. Store review takes days; an update takes minutes.

Do **not** use it for:

- **Anything native.** New native dependencies, permission changes, SDK upgrades and app config
  changes that touch the native projects all need a new binary.
  [What OTA Updates May Not Change](ota-limits-and-policy.md) is the honest list.
- **Routine releases.** If every change ships as an update, your installed binaries drift further
  from your source with every week, and the first time you need a native change the upgrade is
  enormous.
- **Working around store review.** Both stores have rules about this. See the policy page.

You also do not need EAS Update specifically. `expo-updates` reads its server from `updates.url` in
the app config and can point at any server implementing the protocol, including a self-hosted one.

## Basic example

```bash
npx expo install expo-updates
eas update:configure
```

`eas update:configure` writes `updates.url` and `runtimeVersion` into your app config, adds
`extra.eas.projectId`, and sets `channel` on your build profiles.

```json title=app.json
{
  "expo": {
    "runtimeVersion": {
      "policy": "appVersion"
    },
    "updates": {
      "url": "https://u.expo.dev/your-project-id"
    }
  }
}
```

```json title=eas.json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "channel": "preview"
    },
    "production": {
      "channel": "production"
    }
  }
}
```

Then build once — **the channel is baked into the binary** — and publish updates against a branch:

```bash
eas build --platform all --profile production
eas update --branch production --message "fix checkout crash"
```

`eas update --auto` infers the branch from your current git branch and the message from your last
commit, which is convenient in CI and slightly too convenient locally.

## Verified flags

`eas update`, from the `eas-cli` **24.5.0** command manifest:

| Flag | Meaning |
| --- | --- |
| `--branch` | The branch to publish to |
| `--channel` | Publish to the branch currently linked to this channel |
| `--message` / `-m` | Update message, shown in listings |
| `--auto` | Infer branch from git and message from the last commit |
| `--platform` / `-p` | `android`, `ios` or `all` |
| `--rollout-percentage` | Publish to a percentage of users. See [Rollouts and Rollbacks](rollouts-and-rollbacks.md) |
| `--environment` | Use a named EAS environment's variables when bundling |
| `--private-key-path` | Sign the update. See [EAS Update Signing](../expo-security/update-signing.md) |
| `--input-dir`, `--skip-bundler` | Publish a pre-built bundle instead of bundling now |
| `--clear-cache` | Clear the bundler cache first |
| `--no-bytecode` | Do not compile to Hermes bytecode |
| `--source-maps`, `--emit-metadata` | Extra artifacts |
| `--json`, `--non-interactive` | CI-friendly output and behaviour |

Related commands: `eas update:list`, `eas update:view`, `eas update:delete`, `eas update:edit`,
`eas update:republish`, `eas update:rollback`, `eas update:roll-back-to-embedded`,
`eas update:revert-update-rollout`, `eas update:insights`.

## How it works

### What the app does at launch

1. The binary knows its **runtime version** and its **channel** — both were fixed when it was built.
2. On launch, `expo-updates` asks the server at `updates.url` whether a newer update exists for that
   runtime version and channel.
3. If one does, it downloads it in the background.
4. The downloaded update is used at the **next** launch, unless you reload deliberately.

Point 4 is the behaviour users find surprising: by default, a published update is not seen until the
app is restarted twice — once to download, once to run it.

### `updates` config keys

Verified against the installed `@expo/config-types` for SDK 57:

| Key | Notes |
| --- | --- |
| `url` | The update server. Required. |
| `enabled` | Turn updates off entirely for a build |
| `checkAutomatically` | `"ON_LOAD"` (default), `"ON_ERROR_RECOVERY"`, `"WIFI_ONLY"`, `"NEVER"` |
| `fallbackToCacheTimeout` | How long to wait at launch for a newer update before starting with the cached one |
| `requestHeaders` | Extra headers sent to the update server |
| `codeSigningCertificate`, `codeSigningMetadata` | Update signing |
| `useEmbeddedUpdate` | Whether the embedded bundle may be used |
| `assetPatternsToBeBundled` | Which assets are embedded in the binary |
| `disableAntiBrickingMeasures` | Disables safety behaviour. Leave it alone unless you know exactly why. |

`fallbackToCacheTimeout: 0` is the common production choice: the app starts instantly with whatever
it has and picks up a new update on the following launch. A non-zero value trades startup time for
freshness.

### Controlling the update in JavaScript

The default behaviour is deliberately conservative. If you want more control, drive it yourself.
`Updates.useUpdates()` is the hook, verified against the installed `expo-updates` 57.0.22 types:

```tsx title=src/UpdateGate.tsx
import * as Updates from 'expo-updates';
import {useEffect} from 'react';
import {Button, StyleSheet, Text, View} from 'react-native';

export default function UpdateGate() {
  const {currentlyRunning, isUpdateAvailable, isUpdatePending, isDownloading} =
    Updates.useUpdates();

  useEffect(() => {
    // A pending update is downloaded and ready. Reloading here applies it
    // immediately instead of waiting for the user's next cold start.
    if (isUpdatePending) {
      void Updates.reloadAsync();
    }
  }, [isUpdatePending]);

  return (
    <View style={styles.container}>
      <Text>
        {currentlyRunning.isEmbeddedLaunch
          ? 'Running the bundle that shipped with this binary'
          : `Running update ${currentlyRunning.updateId ?? 'unknown'}`}
      </Text>
      {isUpdateAvailable && !isDownloading ? (
        <Button title="Download update" onPress={() => void Updates.fetchUpdateAsync()} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {padding: 16, gap: 8},
});
```

> [!WARNING] Reloading mid-session throws away user state
> `Updates.reloadAsync()` restarts the JavaScript. A half-filled form, an in-progress upload and any
> unsaved state are gone. Reload at a safe moment — app start, or a foreground event after a period
> of inactivity — not the instant an update finishes downloading.

Other verified exports worth knowing: `Updates.channel`, `Updates.runtimeVersion`,
`Updates.updateId`, `Updates.isEmbeddedLaunch`, `Updates.isEmergencyLaunch`,
`Updates.checkForUpdateAsync()`, `Updates.fetchUpdateAsync()`, `Updates.reloadAsync()`,
`Updates.readLogEntriesAsync()`.

## Expo Go vs development build

EAS Update needs `expo-updates`, which is native code. **Expo Go cannot exercise it.** You need a
development build or a release build to test update behaviour at all.

Even then, update behaviour in a development build differs from release: a dev build normally loads
from the dev server. Test the real flow on a `preview` or `production` build before you trust it.

## Common patterns

### One channel per environment, one branch per channel

```bash
eas update --branch production --message "hotfix: retry failed refresh"
eas update --branch preview --message "trying the new empty state"
```

Keeping channel, branch and build-profile names the same removes the mental translation step.
Deviate only when you are deliberately pointing a channel at a different branch, which is the whole
mechanism behind [Rollouts and Rollbacks](rollouts-and-rollbacks.md).

### Check what is actually out there

```bash
eas branch:list
eas channel:list
eas channel:view production
eas update:list --branch production
```

`eas channel:view production` answers the question that matters during an incident: which branch is
the production channel currently pointing at, and what is the newest update on it.

### Publish from CI on a merge

```yaml title=.github/workflows/update.yml
- run: npm ci
- run: npx eas-cli@24.5.0 update --branch production --message "${{ github.event.head_commit.message }}" --non-interactive
  env:
    EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

### Verify what a device is running

```bash
eas update:view <update-group-id>
```

and in the app, surface `Updates.updateId` and `Updates.runtimeVersion` on a debug screen. When a
user reports a bug you cannot reproduce, the first question is which update they are on.

## Security considerations

**Threat.** An update is executable code delivered over the network. Anyone who can serve a response
your app accepts can run code in your app.

**Exploit.** The transport is HTTPS, so the practical attack is not interception — it is an attacker
with access to your Expo account publishing an update to your production branch.

**Fix.**

- Protect the Expo account with two-factor authentication and use a scoped robot token in CI.
- Use `eas channel:protect` to restrict who can publish to a channel.
- Enable **code signing** so the app only accepts updates signed with your key, and an account
  compromise alone is not enough to ship code. See
  [EAS Update Signing](../expo-security/update-signing.md).

**Verification.** With code signing configured, publish an unsigned update to a test branch and
confirm the app rejects it. If it loads, signing is not actually enforced.

## Common mistakes

- **Publishing to a branch whose runtime version does not match the installed binary.** Users get no
  update at all, or — if you forced the runtime version — a bundle that calls native code the binary
  does not have, which crashes on launch. Read [Runtime Versions, Channels and Branches](runtime-versions.md).
- **Expecting an update to include a new native module.** It cannot. The bundle is JavaScript and
  assets; the native module is not there, and the app crashes when it is used.
- **Building without a `channel` and wondering why updates never arrive.** The channel is fixed at
  build time. A binary without one receives nothing.
- **Testing updates in Expo Go.** `expo-updates` is native. Expo Go cannot run this path.
- **Calling `reloadAsync()` as soon as an update downloads.** You destroy whatever the user was
  doing. Reload at a safe moment.
- **Installing `expo-updates` with a bare package-manager install instead of `npx expo install`.**
  You get a version built for a different SDK, and the failure shows up at runtime.
- **Assuming updates are instant for everyone.** Users see a new update on the launch after their
  device downloads it. Rollout across your user base takes as long as your users take to reopen the
  app.

## Related topics

- [Runtime Versions, Channels and Branches](runtime-versions.md) — the compatibility model.
- [What OTA Updates May Not Change](ota-limits-and-policy.md) — the native boundary and store policy.
- [Rollouts and Rollbacks](rollouts-and-rollbacks.md) — shipping to a percentage, and undoing it.
- [eas.json and Build Profiles](eas-json.md) — where `channel` is set.
- [EAS Update Signing](../expo-security/update-signing.md) — making updates unforgeable.
- [Versioning and Runtime Versions](../expo-build-and-release/versioning.md) — how app versions relate.
- [Rollback Strategy](../expo-build-and-release/rollback-strategy.md) — planning the undo before you need it.
- [Monitoring](../expo-build-and-release/monitoring.md) — noticing a bad update quickly.
