---
title: Permissions Hygiene
description: Every permission you hold is a capability an attacker inherits — and a reason a store reviewer rejects your build.
status: current
toolchain: cli
---

A permission is not a feature flag. It is a standing grant of access to something the user owns:
their camera, their contacts, their location history, their photo library. Your app holds that
grant for as long as it is installed, and anything that gains control of your app — a compromised
dependency, an exploited WebView, a malicious native module — holds it too.

That is the security framing, and it lines up exactly with the product framing and the store
framing. Asking for less is better on all three counts, which makes permissions one of the rare
places where doing the secure thing costs nothing.

## Threat

Two distinct threats, with different attackers.

**The app is compromised.** A supply-chain attack lands code inside your bundle or your native
build ([Dependency Auditing](dependency-auditing.md)). That code runs with your app's identity and
therefore with every permission you have been granted. It does not need to ask the user for
anything, because you already did. An app with `READ_CONTACTS` granted is one malicious
dependency away from an exfiltrated address book, and the user sees no prompt.

**The data is over-collected.** No attacker needed. Location, contacts or photo metadata flows to
your servers or to an SDK's servers, where it becomes a breach waiting to happen and a regulatory
question you have to answer. The safest data is the data you never held.

The second threat is far more common than the first, and it is entirely self-inflicted.

## Exploit

### Step 1 — enumerate what you actually ask for

Do this against a release build. Manifest merging means your dependencies can add permissions you
never wrote.

```bash
# From an extracted release APK.
unzip -o app-release.apk -d extracted
aapt2 dump permissions app-release.apk

# Or read the merged manifest Gradle produced.
grep -o 'android:name="android.permission[^"]*"' \
  android/app/build/intermediates/merged_manifests/release/AndroidManifest.xml | sort -u
```

```bash
# iOS: every usage description string in the shipped plist.
plutil -p ios/YourApp/Info.plist | grep -i "UsageDescription"
```

Compare the output against the list of features your app actually has. On almost every real
project the first list is longer, and the extra entries came from dependencies.

### Step 2 — find out who added them

```bash
# Gradle writes a report explaining every merged manifest entry.
cat android/app/build/outputs/logs/manifest-merger-release-report.txt \
  | grep -B 3 "uses-permission"
```

This is the file that tells you an analytics SDK added `ACCESS_FINE_LOCATION`, or that a legacy
image picker added `READ_EXTERNAL_STORAGE`. Without it you are guessing.

### Step 3 — see what a granted permission gives an attacker

The demonstration is uncomfortable precisely because it is trivial. Once the user has granted
contacts access, any code in your process can read contacts, with no prompt and no user-visible
event. There is no second gate between "your app has the permission" and "this line of code uses
the permission" — no per-module scoping, no capability tokens, nothing.

So the question to ask about every permission in the list from step 1 is: **if an attacker had
this, what would they take?** That is the actual exposure, because a compromise of your app is a
compromise of every grant your app holds.

## Fix: least privilege, stated concretely

### 1. Do not request what you do not use today

Not "might use next quarter". Not "the SDK docs said to add it". A permission that no code path
exercises is pure liability: it cannot help you, it can be inherited by an attacker, and it can
get your release rejected.

### 2. Prefer the narrower variant every time

| Instead of | Ask for | Why |
| --- | --- | --- |
| `ACCESS_FINE_LOCATION` | `ACCESS_COARSE_LOCATION` | Most features do not need metre-level precision |
| `LOCATION_ALWAYS` | `LOCATION_WHEN_IN_USE` | Background location is the most scrutinised grant on both stores |
| `READ_EXTERNAL_STORAGE` | The system photo picker, or `READ_MEDIA_IMAGES` | The picker needs no permission at all on modern Android |
| `PHOTO_LIBRARY` | `PHOTO_LIBRARY_ADD_ONLY` | If you only save, you do not need to read |
| `CALENDARS` | `CALENDARS_WRITE_ONLY` | Same principle |
| `READ_CONTACTS` | The system contact picker | The user picks one contact; you never see the rest |

The picker pattern is the most under-used option. `react-native-permissions` 5.6.1 exposes
`openPhotoPicker()` and `openContactPicker()` precisely so you can get one item without holding a
grant over the whole library.

### 3. Ask at the moment of use, with a reason

A permission requested on first launch, before the user knows what the app does, is denied more
often and — when granted — is held for longer than it is needed.

```ts title=src/permissions/requestCamera.ts
import {Platform, Alert, Linking} from 'react-native';
import {
  check,
  request,
  openSettings,
  PERMISSIONS,
  RESULTS,
  type Permission,
  type PermissionStatus,
} from 'react-native-permissions';

const CAMERA: Permission =
  Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;

/**
 * Called from the button that starts the scanner, not from app startup. The
 * user has expressed the intent, so the OS prompt carries clear context
 * and a denial is a real signal rather than a reflex.
 */
export async function ensureCameraForScanner(): Promise<boolean> {
  const current: PermissionStatus = await check(CAMERA);

  switch (current) {
    case RESULTS.GRANTED:
    case RESULTS.LIMITED:
      return true;

    case RESULTS.UNAVAILABLE:
      // No camera on this device, or the feature is not compiled in. Hide the
      // entry point rather than showing a prompt that cannot succeed.
      return false;

    case RESULTS.BLOCKED:
      // The OS will not prompt again. Explain, then offer Settings — do not
      // loop asking.
      Alert.alert(
        'Camera access is off',
        'Scanning needs the camera. You can turn it on in Settings.',
        [
          {text: 'Not now', style: 'cancel'},
          {text: 'Open Settings', onPress: () => void openSettings('application')},
        ],
      );
      return false;

    default: {
      const result = await request(CAMERA, {
        title: 'Scan a code',
        message: 'The camera is used to read the code and is never recorded.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      });
      return result === RESULTS.GRANTED || result === RESULTS.LIMITED;
    }
  }
}

/** Keeping Linking imported documents the alternative to openSettings(). */
export const settingsUrl = Platform.OS === 'ios' ? 'app-settings:' : null;
export const openSettingsDirectly = () => Linking.openSettings();
```

Two details in there that matter beyond ergonomics:

- **`BLOCKED` is terminal.** Re-requesting does nothing on either platform. An app that loops on a
  denied permission trains users to distrust its prompts.
- **`LIMITED` is a real grant.** On iOS, a user who shares a subset of their photo library
  produces `limited`, which your code must treat as success with a smaller result set — not as a
  failure to retry.

### 4. Trim what the build compiles in

On iOS, `react-native-permissions` only compiles the permission handlers you list, and each
handler links APIs that Apple's review tooling notices.

```ruby title=ios/Podfile
node_require('react-native-permissions/scripts/setup.rb')

# Only the handlers this app genuinely uses. Every uncommented line here needs
# a matching usage description in Info.plist, and vice versa.
setup_permissions([
  'Camera',
  'PhotoLibraryAddOnly',
])
```

Then keep `Info.plist` in sync — an unused `NS...UsageDescription` string is a claim you cannot
justify:

```bash
# Every usage description should correspond to a permission you request.
plutil -p ios/YourApp/Info.plist | grep -i UsageDescription
grep -rn "PERMISSIONS.IOS" src/ | sort -u
```

### 5. Remove what a dependency added

Manifest merging is additive, so the only way to drop a permission a library declared is to
remove it explicitly:

```xml title=android/app/src/main/AndroidManifest.xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
          xmlns:tools="http://schemas.android.com/tools">

    <!--
      An SDK declares this for a feature we do not use. Removing it keeps the
      grant off the store listing and out of an attacker's inheritance.
      Test the SDK's behaviour afterwards: some degrade, some crash.
    -->
    <uses-permission
        android:name="android.permission.ACCESS_FINE_LOCATION"
        tools:node="remove" />

</manifest>
```

Verify with `aapt2 dump permissions` afterwards, not by assuming the merge did what you asked.

### 6. Revisit grants you no longer need

Neither platform lets an app drop a granted permission in a way that is simple and universal, so
the practical version of this rule is procedural: when you remove a feature, remove its permission
declaration in the same pull request. A grant that outlives its feature is the purest form of the
liability this page is about.

## Store review: over-requesting gets you rejected

This is not a security argument but it lands in the same pull request, and it is the one that
actually blocks releases.

- **Apple** rejects builds whose usage description strings are vague or do not match observed
  behaviour. "This app needs access to your photos" is a rejection; a sentence naming the feature
  and why it needs the data is not. Background location and tracking permissions draw extra
  scrutiny and can require an explanation of what the app does when the user is not looking at it.
- **Google Play** operates declared-permission policies with a required Data Safety declaration
  that must match what the app actually does. Some permissions — SMS, call log, background
  location, all-files access — require a form, an approved use case, and in some cases a demo
  video. An unjustified declaration is a suspended listing, not a warning.
- **Both** require your privacy policy to describe what you collect. A permission you hold but do
  not disclose is a compliance gap.

Practical consequence: **a permission your app does not need can cost you a release cycle.** That
is usually more persuasive internally than the security argument, so lead with it when you need to.

## Platform differences

:::tabs
@tab iOS
- Permissions are declared implicitly by including a usage description key. A missing key means
  the app is terminated the moment the API is touched — a crash, not a denial.
- Most grants are one-shot: once denied, the system will not prompt again, and the user must go
  to Settings. `openSettings('application')` is the only path back.
- `limited` is a first-class outcome for photos. Handle it.
- Tracking is its own permission (`APP_TRACKING_TRANSPARENCY`) on top of any data access, and it
  has its own review rules.
- The usage description string is shown to the user verbatim. Write it as an explanation, because
  both the reviewer and the user judge you on it.

@tab Android
- Permissions are declared in the manifest and, for dangerous ones, requested at runtime.
- Manifest merging means a dependency can add a declaration. The merger report is the only
  reliable inventory.
- The second denial is effectively permanent — the system stops prompting, which surfaces as
  `blocked`.
- Scoped storage removed most reasons to ask for storage permissions at all. If your code still
  requests `READ_EXTERNAL_STORAGE` or `WRITE_EXTERNAL_STORAGE`, that is usually a migration you
  have not done.
- `PermissionsAndroid` is available in core React Native for simple cases;
  `react-native-permissions` is worth it once you need the same code path on both platforms.
:::

## Verification

### 1. Diff the permission list every release

```bash title=scripts/check-permissions.sh
#!/usr/bin/env bash
set -euo pipefail
APK="${1:?usage: check-permissions.sh <apk>}"
BASELINE="permissions.baseline.txt"

aapt2 dump permissions "$APK" | grep "uses-permission" | sort -u > permissions.current.txt

if ! diff -u "$BASELINE" permissions.current.txt; then
  echo "FAIL: permission set changed. Review the diff, then update $BASELINE." >&2
  exit 1
fi
echo "OK: permission set unchanged"
```

Committing the baseline makes every permission change a deliberate, reviewed event — including
the ones a dependency upgrade introduces silently.

### 2. Prove each permission is used

For every entry in the baseline, point at the code path that needs it. If you cannot, remove it
and see what breaks. "We think the SDK needs it" is not an answer; the merger report tells you
which SDK, and the SDK's documentation tells you whether it is optional.

### 3. Test every denial path

Deny each permission and use the app. The correct behaviours are: a clear explanation, a working
fallback where one exists, and no crash. Then set the permission to blocked and confirm the app
offers Settings instead of re-prompting in a loop.

### 4. Check the iOS build only contains the handlers you listed

```bash
grep -A 25 "setup_permissions" ios/Podfile
plutil -p ios/YourApp/Info.plist | grep -c UsageDescription
```

The two lists should describe the same set. A usage description with no matching handler is a
string you are showing users about a feature you do not have.

## Common mistakes

- **Requesting everything at launch.** The user has no context, denial rates are high, and you
  hold grants you are not using for the entire session.
- **Treating a permission as a one-time cost.** It is a standing capability. Anything that
  compromises the app inherits it, silently.
- **Ignoring what dependencies declare.** Your manifest is not the shipped manifest. Read the
  merger report.
- **Requesting the wide variant because it is simpler.** `ACCESS_FINE_LOCATION` when coarse would
  do is more data, more scrutiny, and more to lose.
- **Treating `limited` as a failure.** The user granted access to some photos. Show those.
- **Re-prompting after `blocked`.** Nothing happens, and the user concludes the app is broken.
- **Leaving usage descriptions for removed features.** Reviewers read them, and an unjustified
  string invites a question you cannot answer.
- **Using a storage permission to open a file the picker would have handed you.** The picker
  needs no grant and cannot be abused by a compromised app later.
- **Forgetting the Data Safety and privacy declarations.** The permission list and the declared
  data collection have to tell the same story.

## Related topics

- [Permissions](../platform-apis/permissions.md) — the full API surface, flows and platform specifics.
- [Dependency Auditing](dependency-auditing.md) — the attacker who inherits these grants.
- [Threat Model](threat-model.md) — where this sits among the cheap, high-value controls.
- [Camera](../platform-apis/camera.md) — a feature whose grant is commonly over-requested.
- [Geolocation](../platform-apis/geolocation.md) — the permission with the most store scrutiny.
- [Release Checklist](../build-and-release/release-checklist.md) — where the permission diff belongs.
