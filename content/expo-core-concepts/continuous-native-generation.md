---
title: Continuous Native Generation
description: In an Expo project the ios/ and android/ directories are build output generated from the app config and installed packages, not source you maintain. What that buys you, what it limits, and how it works.
status: current
toolchain: expo
sdk: 57
---

**Continuous Native Generation (CNG)** is the idea that the `ios/` and `android/` directories of
an app are **build output**, produced on demand from inputs you do control:

- your [app config](app-config.md) (`app.json` or `app.config.ts`);
- the packages in `package.json`, and the config plugins they register;
- a native project template matched to your SDK version.

A new project from `npx create-expo-app@latest` has no `ios/` or `android/` directory at all.
The default template's `.gitignore` ends with:

```text
# generated native folders
/ios
/android
```

That is the whole model in two lines. The native projects are regenerated whenever they are
needed, the same way `dist/` is regenerated in a web project, and nobody commits them.

## Why it exists / when to use it — and when NOT to

The alternative — committing native projects and editing them by hand — is what the
[React Native Community CLI](../getting-started/introduction.md) does. It works, and it has one
recurring cost: **every React Native upgrade is a merge.** The new template's native files change,
your hand-edited copies have changed too, and someone reconciles the two by hand.

CNG removes that merge. When the SDK changes, the template changes, and the native projects are
regenerated from it with your config applied on top. Nothing to reconcile, because nothing was
hand-edited.

Use CNG when:

- every native change your app needs can be expressed in the app config, an SDK package, a
  community config plugin, or a plugin you write;
- you want SDK upgrades to be a version bump plus a regenerate;
- you want reviewers to read a 3-line `app.json` diff rather than a 300-line `project.pbxproj`
  diff.

Do **not** rely on CNG when:

- you have a large body of hand-written native code in the app target that no plugin can sensibly
  reproduce;
- your organisation requires the native projects to be committed and audited as source;
- you are adding React Native to an existing native app.

In those cases, commit the native directories and stop regenerating them. That is a supported
choice with real costs, compared in [CNG vs Committed Native Directories](cng-vs-committed-native.md).

## Basic example

Take a common native change: an iOS permission string and an Android permission for the camera.

Without CNG you would edit `ios/MyApp/Info.plist` and `android/app/src/main/AndroidManifest.xml`.
With CNG you declare it once in the app config:

```json title=app.json
{
  "expo": {
    "name": "MyApp",
    "slug": "my-app",
    "ios": {
      "bundleIdentifier": "com.example.myapp",
      "infoPlist": {
        "NSCameraUsageDescription": "MyApp uses the camera to scan receipts."
      }
    },
    "android": {
      "package": "com.example.myapp",
      "permissions": ["android.permission.CAMERA"]
    }
  }
}
```

Then generate the native projects, or let a build do it:

```bash
npx expo prebuild          # generate ios/ and android/ from config
npx expo run:android       # generates android/ first if it is missing, then builds
```

The generated `Info.plist` and `AndroidManifest.xml` contain those entries. If you delete both
directories and regenerate, they come back identical — that repeatability is the property CNG
depends on.

> [!DANGER] Regeneration deletes hand edits
> In SDK 57, `npx expo prebuild` **clears and regenerates** the native directories by default.
> Anything you typed into `ios/` or `android/` by hand is removed. Under CNG that is correct
> behaviour — the directories are output. It is only a disaster if someone treated them as
> source. See [expo prebuild](prebuild.md).

## How it works

Prebuild runs roughly this pipeline, verified against the installed `@expo/cli@57.0.24`
(`prebuild/prebuildAsync.js`):

1. **Resolve the config.** `@expo/config` reads `app.config.ts` / `app.config.js` and/or
   `app.json`, plus defaults from `package.json`.
2. **Clear** the existing platform directories — the default, unless `--no-clean` is passed.
3. **Copy the native template** for your SDK into `ios/` and `android/`.
4. **Apply config.** Built-in config handlers write your `name`, `bundleIdentifier`, `package`,
   icons, permissions and so on into the native files. Then every **config plugin** listed in
   `plugins` — plus plugins that installed packages register automatically — runs its "mods",
   which edit native files programmatically. (`npx expo install` adds a package's plugin to
   `plugins` for you when the package ships one and your config is static JSON; a small set of
   SDK packages' plugins are also applied by default.)
5. **Install CocoaPods** for iOS, unless `--no-install` is passed.

Autolinking then finds native code in `node_modules` at build time, exactly as it does in a CLI
project.

### Config plugins are how you extend it

If the app config has no key for the native change you need, a config plugin is the intended
answer. A plugin is a function that receives the config and returns it with native modifications
attached. Many libraries ship one, and it is listed in `plugins`:

```json title=app.json
{
  "expo": {
    "plugins": [
      "expo-router",
      ["expo-splash-screen", {"backgroundColor": "#208AEF", "image": "./assets/images/splash-icon.png", "imageWidth": 76}]
    ]
  }
}
```

That is the exact shape the SDK 57 default template ships. Writing your own is covered in
[What a Config Plugin Is](../expo-config-plugins/what-they-are.md).

### What CNG cannot express well

Plugins edit files. They are good at inserting a key into a plist, a permission into a manifest,
a line into a Gradle file or a setting into the Xcode project. They are poor at maintaining whole
hand-written Swift or Kotlin classes that live in the app target, or at making large structural
edits that conflict with each new template.

For custom native *code*, the usual CNG-compatible answer is a module — an Expo module in your
repo, or a library — rather than editing the app target. That keeps generation working.

## Common patterns

### Inspect what gets generated

Generation is deterministic, so you can look at the output without committing it:

```bash
npx expo prebuild --platform android
git status   # android/ is ignored, so nothing to commit
```

Open the generated files, confirm your plugin did what you expected, then delete them or leave
them for the next build to overwrite.

### Review the resolved config instead of native files

```bash
npx expo config --type public
```

`npx expo config` prints the fully resolved app config (`--type` and `--full` are real flags in
SDK 57's CLI). Under CNG, this output — not the native projects — is the thing to review.

### Regenerate after native-affecting changes

After you add a package with native code, change `plugins`, or edit anything in the app config
that lands in native files, regenerate and rebuild. JavaScript-only changes never need it.

## Common mistakes

- **Committing `ios/` and `android/` "just in case" while still running prebuild.** You now
  have source-controlled files that the tool deletes and rewrites. Diffs become noise and hand
  edits vanish. Pick one model.
- **Hand-editing a generated file to "quickly fix" a build.** Wrong: edit
  `android/app/build.gradle`, then the next prebuild erases it. Right: put the change in the app
  config, `expo-build-properties`, or a config plugin.
- **Believing CNG means "no native code".** You can have as much native code as you want in
  modules and libraries. CNG is only about the app's own native *project* files.
- **Expecting config changes to appear without regenerating.** Changing `app.json` does nothing
  to an existing binary. Regenerate and rebuild.
- **Diagnosing a native issue in a stale generated directory.** If `ios/` was generated weeks and
  two SDK bumps ago, regenerate before debugging it.

## Related topics

- [expo prebuild](prebuild.md) — the command that performs generation, and why it is destructive.
- [CNG vs Committed Native Directories](cng-vs-committed-native.md) — the decision this model forces.
- [The App Config](app-config.md) — the main input to generation.
- [What a Config Plugin Is](../expo-config-plugins/what-they-are.md) — extending generation.
- [expo-build-properties](../expo-config-plugins/build-properties.md) — Gradle and CocoaPods settings without a custom plugin.
- [Expo Go vs Development Builds](expo-go-vs-development-builds.md) — generation only matters once you build your own binary.
- [Project Structure](../getting-started/project-structure.md) — the committed-native layout on the CLI half, for contrast.
