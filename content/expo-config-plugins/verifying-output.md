---
title: Verifying Generated Native Output
description: Proving a config plugin did what you meant — run prebuild in a scratch copy, diff the generated android/ and ios/ directories, and use introspection for a no-write preview.
status: current
toolchain: expo
sdk: 57
---

A config plugin edits files you normally never open. "The plugin should have added that permission"
is a hope; a diff of the generated native project is a fact. This page is the procedure for getting
that diff **without risking your real working tree**.

Everything below was run against a scratch copy of an SDK 57 project (`expo@57.0.22`,
`@expo/cli@57.0.24`) on Windows, for the Android platform. The output shown is the real output of
those runs. iOS generation was not run on this machine — see
[Platform differences](#platform-differences).

> [!DANGER] `npx expo prebuild` clears and regenerates the native directories
> In SDK 57, `npx expo prebuild` **deletes `ios/` and `android/` and recreates them** by default.
> The installed CLI's own help text describes the opt-out, `--no-clean`, as "Apply changes to the
> existing native folders instead of recreating them". Any hand edit in those directories is gone
> after a normal prebuild, and there is no undo.
>
> That is why every command on this page runs in a **scratch copy**. Never verify a plugin by
> running prebuild in a checkout that contains native edits you have not committed.

## Why it exists / when to use it — and when NOT to

Verify after:

- Adding or upgrading a library that ships a plugin.
- Writing or changing your own plugin.
- Upgrading the SDK — the template changed, and string mods may no longer match.
- Reordering the `plugins` array.

You do not need a scratch prebuild to check a single `Info.plist` or manifest value.
[Introspection](#introspection-a-preview-that-writes-nothing) is faster and writes nothing. Use the
full diff when you need to see Gradle files, the Podfile, or everything a plugin touched.

## Basic example

The procedure: copy the project, commit a baseline native tree **without** the change, apply the
change, prebuild again, diff.

```bash
# 1. A scratch copy. Your real checkout is never touched.
git worktree add ../myapp-verify HEAD
cd ../myapp-verify
npm ci

# 2. Baseline: generate native directories from the config as it is now.
npx expo prebuild --no-install --platform android
git add -A && git commit -m "baseline native output"

# 3. Apply the change you want to verify (edit app.json, add a plugin),
#    then regenerate.
npx expo prebuild --no-install --platform android

# 4. The answer.
git diff --stat -- android
git diff -- android/app/src/main/AndroidManifest.xml
```

`git worktree` gives you an independent working directory on the same repository, so the scratch
commits never land on your branch. Remove it with `git worktree remove ../myapp-verify` when you are
done. A plain directory copy works equally well.

`--no-install` skips installing npm packages and CocoaPods, which is not needed to read the
generated files and makes each run much faster.

### Real output

Adding one local plugin that writes a `<meta-data>` element produced exactly this — a one-file, two-
line diff, which is what a well-behaved plugin should produce:

```text
 android/app/src/main/AndroidManifest.xml | 2 ++
 1 file changed, 2 insertions(+)
```

```diff
   <application android:name=".MainApplication" android:label="@string/app_name" ...>
+    <meta-data android:name="com.example.ORDER" android:value="A-first-in-array"/>
+    <meta-data android:name="com.example.analytics.API_KEY" android:value="public-client-key"/>
     <meta-data android:name="expo.modules.updates.ENABLED" android:value="false"/>
```

(The `<application>` line is shortened here; everything else is verbatim.)

If your diff touches files you did not expect, that is the finding. Read it before you build.

## How it works

### What prebuild does, in order

1. With the default behaviour, removes the existing native directories for the selected platforms.
2. Copies the native template for your SDK.
3. Evaluates the app config, applies every plugin, and runs the mods over the template's files.
4. Writes the results, and installs dependencies unless you passed `--no-install`.

Because step 1 starts from nothing, a normal prebuild diff shows the effect of your **whole** config
on a fresh template — not an incremental change.

### Flags that matter here

Read from `npx expo prebuild --help` in `@expo/cli` 57.0.24:

| Flag | Use it for |
| --- | --- |
| `--no-install` | Skip npm and CocoaPods installs. Verification never needs them. |
| `-p, --platform <all\|android\|ios>` | Limit generation to one platform. Default `all`. |
| `--no-clean` | Apply changes to the existing native folders instead of recreating them. |
| `--template <template>` | Generate from a specific template. |
| `--skip-dependency-update <deps>` | Keep listed package versions in `package.json` unchanged. |

`--clean` is still accepted by the argument parser, but since clearing is now the default it changes
nothing. Older articles that tell you to add `--clean` are describing a previous default.

### `--no-clean` as an idempotency test

Running `--no-clean` over the output of a previous prebuild reapplies every plugin to files that
already contain its changes. A correct plugin produces **no diff**:

```bash
git add -A && git commit -m "with plugin"
npx expo prebuild --no-install --no-clean --platform android
git diff --stat -- android
grep -c "com.example.ORDER" android/app/src/main/AndroidManifest.xml
```

On the scratch project above, `git diff --stat` printed nothing and the `grep -c` printed `1`. A
plugin that appends without checking shows up here as a second copy.

### Introspection: a preview that writes nothing

`npx expo config --type introspect` evaluates your plugins against in-memory copies of the
structured native files and prints the resulting config. It makes no filesystem changes.

```bash
npx expo config --type introspect --json
```

The evaluated file contents land under `_internal.modResults`. On the SDK 57 scratch project, the
keys present were:

```text
android: manifest,strings,gradleProperties,colors,styles,colorsNight
ios: infoPlist,entitlements,expoPlist,podfileProperties
```

That list is the limit of introspection. The mod compiler removes every mod whose base mod is not
introspection-capable, so **Gradle files, the Podfile, `MainApplication`, `AppDelegate`, the Xcode
project and all dangerous mods are absent**. For those you need the scratch prebuild.

## Platform differences

:::tabs
@tab Android
Generation and diffing work on macOS, Linux and Windows. Everything on this page was run on Windows.

On Windows, git may print `LF will be replaced by CRLF` warnings for every generated file. They are
noise about line-ending conversion, not content changes. In a throwaway repository you can silence
them with `git config core.autocrlf false` before the baseline commit.
@tab iOS
`npx expo prebuild --no-install --platform ios` generates the `ios/` directory without running
CocoaPods, which is what a diff needs. This page's iOS procedure was **not** run as part of writing
it, because the authoring machine was Windows; verify the same steps on your own machine.

The files worth diffing first are `ios/<name>/Info.plist`, `ios/<name>/<name>.entitlements`, the
`Podfile`, and `ios/<name>.xcodeproj/project.pbxproj`. The `.pbxproj` diff is noisy; read it for
the build setting or file reference you expected, not line by line.
:::

## Common patterns

### Verify in CI

Run the baseline-and-diff procedure on pull requests that change `app.json`, `app.config.*`,
`plugins/` or `package.json`, and post `git diff --stat -- android ios` as a job artifact. Reviewers
then see native consequences of a config change without running anything.

### Snapshot the generated files you care about

Commit a copy of the handful of generated files that matter — the manifest, `Info.plist`, the
entitlements — to a `native-snapshots/` directory, refreshed from a scratch prebuild. A pull request
that changes them shows a readable diff in review, while `android/` and `ios/` stay generated.

### Diff before and after an SDK upgrade

Generate the baseline on the old SDK, upgrade in the scratch copy, regenerate, diff. String mods that
stopped matching show up as a change that silently **disappeared** — the most important thing an
upgrade diff can tell you.

## Security considerations

**Threat.** A plugin can add permissions, entitlements, exported components or network security
settings that nobody on the team chose.

**Exploit.** A library upgrade quietly adds `android:exported="true"` to an activity, or a new
permission. The first person to notice is a store reviewer — or an attacker invoking the exported
component.

**Fix.** Diff the generated native output for every dependency change that includes a plugin.

**Verification.** In the scratch copy after the change:

```bash
git diff -- android/app/src/main/AndroidManifest.xml | grep -E "^\+.*(uses-permission|exported|usesCleartextTraffic)"
```

Any line printed is a change to your attack surface that needs an owner.

## Common mistakes

- **Running prebuild in your real checkout "to check quickly".** It clears and regenerates the native
  directories. Use a worktree or a copy.
- **Diffing without a baseline commit.** A freshly generated tree diffed against nothing is thousands
  of lines. Commit the baseline first.
- **Adding `--clean` because an old guide says so.** Clearing is already the SDK 57 default; the
  flag does nothing new.
- **Trusting introspection for Gradle or Podfile changes.** Those mods are not introspected at all.
- **Forgetting `--no-install`.** Verification waits minutes for installs whose output you do not
  read.
- **Reading only the file you expected to change.** Always start with `git diff --stat`; the
  unexpected file is the interesting one.
- **Assuming a missing change means a missing plugin.** Check plugin order and whether a string mod's
  anchor still matches — see [Testing Plugins and Common Failures](testing-and-failures.md).

## Related topics

- [Mods and the Dangerous Mods](mods.md) — which mods introspection can and cannot see.
- [Writing Your Own Plugin](writing-your-own.md) — making a plugin idempotent.
- [Testing Plugins and Common Failures](testing-and-failures.md) — what to do when the diff is wrong.
- [Using Community Plugins](using-community-plugins.md) — reviewing a library's plugin.
- [expo prebuild](../expo-core-concepts/prebuild.md) — the command itself.
- [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md) — why prebuild is destructive.
