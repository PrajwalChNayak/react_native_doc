---
title: CNG vs Committed Native Directories
description: The one structural decision inside an Expo project — generate ios/ and android/ from config every time, or commit them and maintain them by hand. The trade-offs, how to decide, and how to move in either direction.
status: current
toolchain: expo
sdk: 57
---

Every Expo project is on one of two strategies for its native projects, whether or not the team
has noticed:

1. **Continuous Native Generation (CNG).** `ios/` and `android/` are ignored by git and
   regenerated from the app config by [`npx expo prebuild`](prebuild.md) whenever needed.
2. **Committed native directories.** `ios/` and `android/` are in git, edited by hand, and prebuild
   is never run again.

Both are supported. Both ship real apps. What is **not** supported is a mixture, because in SDK 57
prebuild clears and regenerates the native directories by default — and a mixture means someone's
hand edits are sitting in a directory the tool believes it owns.

> [!DANGER] Mixing the strategies destroys work
> Committed native directories plus a single `npx expo prebuild` equals lost hand edits. Ignored
> native directories plus a hand edit equals the same loss on the next generate, usually on
> another machine. Choose one, document it, and enforce it in CI.

## Why it exists / when to use it — and when NOT to

The decision exists because there are two sources of truth for native configuration — the app
config and the native files — and only one can win.

### Choose CNG when

- Your native needs are covered by SDK packages, the app config, `expo-build-properties`,
  community config plugins, or plugins you are willing to write.
- You want SDK upgrades to be a version bump and a regenerate.
- Your team is mostly JavaScript and TypeScript engineers.
- You build on several machines or services and want them to produce identical native projects.

### Choose committed native directories when

- You have substantial hand-written native code inside the app target that cannot reasonably be
  expressed as plugins or moved into modules.
- Policy requires native project files to be reviewed and audited as source.
- You are integrating with native tooling that edits the Xcode or Gradle projects directly and
  cannot be driven through config.
- You have tried to express a change as a plugin and the plugin is more fragile than the edit.

If you are unsure, **start on CNG**. Moving from CNG to committed is a single prebuild and a
commit. Moving back is a translation project.

## Basic example

Where the choice is visible in a repository:

:::tabs
@tab CNG
```text title=.gitignore
# generated native folders
/ios
/android
```

```bash
# Anyone, anywhere, at any time:
npx expo prebuild
```
@tab Committed
```text title=.gitignore
# /ios and /android removed from this file — they are source now
```

```bash
# Native changes are edits to files in ios/ and android/.
# npx expo prebuild is never run on this project.
npx expo run:android
```
:::

The CNG `.gitignore` lines are exactly what the SDK 57 default template ships.

## How it works — the trade-offs in full

| Concern | CNG | Committed native directories |
| --- | --- | --- |
| Source of truth for native config | App config and plugins | Native files |
| SDK upgrade | Bump, `npx expo install --fix`, regenerate | Bump, `--fix`, then merge native template changes by hand |
| Native flexibility | Whatever config and plugins can express | Anything |
| Code review of native changes | Small config or plugin diffs | Raw `project.pbxproj`, Gradle and manifest diffs |
| Effect of `npx expo prebuild` | Normal, safe, expected | Destroys hand edits (clean is the default) |
| Config plugins in `plugins` | Applied on every generate | Not applied — nothing regenerates |
| App config keys for icons, identifiers, permissions | Take effect on regenerate | Stop driving native files; edit the native files instead |
| EAS Build | Runs prebuild to generate the directories | Does not run prebuild; uses your committed directories |
| Onboarding | Clone, install, build | Clone, install, build — plus knowing the native projects |
| Failure mode | Plugin coverage gaps; plugins lag SDK releases | Upgrade merges; drift between app config and native files |

The row that surprises teams most is **config plugins**. Under the committed strategy, adding a
library whose setup is "add this plugin to `app.json`" does nothing on its own. You either apply
its native changes by hand, following the library's manual installation instructions, or you
temporarily generate on a branch to see what the plugin would have written and copy it across.

## Common patterns

### Moving from CNG to committed

This is cheap, and it is the supported replacement for what old tutorials called ejecting.

```bash
git switch -c commit-native
npx expo prebuild                 # generate from the current config
# remove /ios and /android from .gitignore
git add ios android .gitignore
git commit -m "Commit native directories; stop running prebuild"
```

Then, in the same change:

- write the decision in the README;
- remove `npx expo prebuild` from scripts and CI;
- add a CI check that `git status --porcelain ios android` is empty after a build, so an accidental
  regenerate fails loudly.

### Moving from committed back to CNG

This is the expensive direction, because every hand edit has to be re-expressed.

1. Generate a fresh copy on a throwaway branch and diff it against what is committed:

   ```bash
   git switch -c cng-audit
   npx expo prebuild --no-install
   git diff --stat -- ios android
   ```

   Every hunk in that diff is either a hand edit or template drift.
2. For each hand edit, decide: an app config key, `expo-build-properties`, an existing plugin, a
   plugin you write, or native code moved into a module.
3. Repeat the generate-and-diff until the only remaining differences are ones you accept.
4. Delete `ios/` and `android/` from git, add them back to `.gitignore`, and remove the CI guard.

Budget for this. On a project with years of native edits it is real work.

### A middle ground that is not a mixture

Keep CNG for the app projects and put custom native code in a **local Expo module** inside the
repository. The module is source you maintain; the app project stays generated. That keeps the
upgrade benefit while giving you arbitrary Swift and Kotlin. See
[The Expo Modules API](../expo-native-code/expo-modules-api.md).

## Common mistakes

- **Never making the decision.** The default template ignores the native directories; the first
  engineer who removes that line to "fix" something has silently switched strategies for the team.
- **Committing native directories and continuing to run prebuild.** Wrong: commit `ios/`, then add
  `npx expo prebuild` to CI. Right: pick committed and delete prebuild from every script, or pick
  CNG and stop committing.
- **Expecting `plugins` to apply under the committed strategy.** Nothing regenerates, so nothing
  applies. Follow the library's manual native setup.
- **Changing `ios.bundleIdentifier` in `app.json` on a committed project and expecting the build to
  change.** The committed Xcode project is the source of truth now.
- **Assuming the move back to CNG is as cheap as the move away.** It is a diff-and-translate
  exercise proportional to how much native code was hand-edited.
- **Treating "committed" as leaving Expo.** You still use the SDK, `npx expo install`, Expo Router
  and, if you want, EAS. Only generation stops.

## Related topics

- [Continuous Native Generation](continuous-native-generation.md) — the model behind strategy 1.
- [expo prebuild](prebuild.md) — the command, its flags, and why it is destructive.
- [What a Config Plugin Is](../expo-config-plugins/what-they-are.md) — how to stay on CNG when config has no key.
- [expo-build-properties](../expo-config-plugins/build-properties.md) — the plugin that covers most Gradle and CocoaPods needs.
- [Ejecting Is Not a Thing Any More](../expo-vs-bare/ejecting-is-gone.md) — why this choice replaced eject.
- [Moving from Expo to Bare](../expo-vs-bare/moving-to-bare.md) — going further than committing native directories.
- [Upgrading Between SDK Versions](../expo-migration/upgrading-sdk.md) — what each strategy costs at upgrade time.
