---
title: Obfuscation and Its Limits
description: What R8 and JavaScript minification actually do to a React Native app, what they cost, and why neither is a security control.
status: current
toolchain: cli
---

Obfuscation makes code harder to read. That is the whole claim, and it is a real one — harder to
read means more hours for an attacker, and most attackers do not spend hours. What it is not is
encryption, protection, or a reason to put something in the binary that does not belong there.

This page separates the two halves people conflate: R8 on the Android side, which shrinks and
renames your Java and Kotlin, and JavaScript minification on the Metro side, which in a default
React Native 0.87 build **does not run at all**. Both facts are verifiable from the installed
toolchain, and the second one surprises nearly everyone.

## Threat

Someone has your app and wants to understand it. Their goals, in increasing order of effort:

1. **Find a credential.** Automated, seconds. Covered in
   [Why Secrets in JS Are Readable](secrets-in-the-bundle.md) — obfuscation does not help here,
   because string constants survive every transformation on this page.
2. **Understand your API.** Endpoint paths, parameter names, request signing. A day with a
   decompiler.
3. **Modify and repackage.** Remove a paywall, disable a check, republish. Days.
4. **Extract an algorithm.** Pricing logic, a matching algorithm, anything proprietary. Days to
   weeks.

Obfuscation moves each of these along the effort axis. It removes none of them.

## What actually happens to your code

### Android: R8

R8 is the default shrinker in the Android Gradle Plugin. When enabled for a variant it does four
things, and only the third is "obfuscation":

| Pass | What it does | Security value |
| --- | --- | --- |
| Shrinking | Removes unreachable classes and members | None directly; a smaller attack surface in the weakest sense |
| Optimisation | Inlines, merges, removes dead branches | Makes decompiled output less like your source |
| Obfuscation | Renames classes, methods and fields to `a`, `b`, `c` | Raises reading effort |
| Resource shrinking | Drops unused resources | None |

What R8 does **not** touch: string literals, resource values, your manifest, native `.so`
contents, or the Hermes bundle in `assets/`. Your endpoint URLs and every string in your Kotlin
come through unchanged and `strings` still prints them.

Check whether it is even on in your project — React Native's Android template has historically
shipped with the shrinker disabled for release builds, so do not assume:

```bash
grep -n "minifyEnabled\|shrinkResources\|enableProguardInReleaseBuilds\|proguardFiles" \
  android/app/build.gradle
```

### JavaScript: minification is off by default

This is the part to check before designing anything around it. React Native turns Metro's
minifier **off** when Hermes is enabled, which it is by default in 0.87. The reasoning is
performance: Hermes compiles to bytecode, so mangling identifiers first buys nothing.

Both build paths say so in the installed 0.87.1 package:

```bash title=the iOS build script
# react-native/scripts/react-native-xcode.sh
# Hermes doesn't require JS minification.
# if [[ $USE_HERMES != false && $DEV == false ]]; then
#   EXTRA_ARGS+=("--minify" "false")
# fi
grep -n -B 1 -A 3 "minify" node_modules/react-native/scripts/react-native-xcode.sh
```

```bash title=the Android Gradle plugin
# TaskConfiguration.kt: task.minifyEnabled.set(!isHermesEnabledInThisVariant)
grep -rn "minifyEnabled.set" \
  node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/
```

So the obfuscation many teams believe protects their JavaScript — Terser renaming local variables
— is not happening. What you get instead is Hermes bytecode, and
[the string table in a Hermes bundle is plain data](secrets-in-the-bundle.md).

`metro-minify-terser` (0.87.0) is installed and is still Metro's default minifier; it is
not invoked on a Hermes release build. If you turn it on anyway, the honest accounting is:

| Terser on a Hermes build | Effect |
| --- | --- |
| Bundle size | Slightly smaller intermediate, essentially no change to final bytecode size |
| Build time | Longer |
| Readability of extracted strings | Unchanged |
| Readability of decompiled bytecode | Marginally worse for the attacker |
| Stack traces | Worse, unless you keep and upload the source map |

That is not a compelling trade for most apps. Decide it on build-time and size grounds, not on
security grounds.

## Fix: turn R8 on, deliberately, and know what it buys

Enabling R8 is worth doing — mostly for app size, partly for effort. Treat it as a build change
with a testing cost, because that is what it is.

```gradle title=android/app/build.gradle
android {
    buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"),
                          "proguard-rules.pro"
        }
    }
}
```

React Native ships its own keep rules with the AAR, so the framework itself survives. Reading
`ReactAndroid/proguard-rules.pro` in the installed 0.87.1 package, they keep everything annotated
`@DoNotStrip`, every `NativeModule` implementation, all native method members, `@ReactProp`
methods, and the TurboModule core packages. You do not need to re-declare those.

What you do need to declare is anything *your* code or your dependencies reach by name.

### Over-aggressive rules break reflection, and only in release

This is the real cost of R8, and it is why the pass rate of "we enabled minification" pull
requests is so low. Anything that finds a class or member by string name at runtime breaks
silently when the name changes:

- **JSON serialisation by reflection.** Gson, Moshi's reflective adapter and Jackson map JSON keys
  to field names. Renamed fields mean fields that silently deserialise to null.
- **Your own native modules.** A TurboModule is kept by React Native's rules, but a helper class
  it instantiates by name is not.
- **Anything using `Class.forName`.** Including some dependency-injection setups and some
  analytics SDKs.
- **Enum `valueOf`** and enums used as JSON values.

```proguard title=android/app/proguard-rules.pro
# Data classes deserialised by reflection. Keep the member NAMES, which is the
# part that matters — the class may still be renamed.
-keepclassmembers class com.example.app.model.** {
    <fields>;
    <init>(...);
}

# Keep the annotation itself, or annotation-driven keeps stop working.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# Readable release stack traces. Without these, every crash report is
# unreadable even with a mapping file, because line numbers are gone.
-keepattributes SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile
```

> [!WARNING] `-keep class ** { *; }` is not a fix
> The instinctive response to a release-only crash is to keep everything until it stops. That
> disables shrinking, optimisation and renaming in one line, so you keep the build time and the
> testing cost and lose every benefit. Find the specific class and keep that.

### Keep the mapping file

R8 writes `mapping.txt` for each release build. Without it, your crash reports are
unreadable — and it is the same file an attacker would love to have, so it goes to your crash
reporting service and your artifact store, not into the repository.

```bash
ls android/app/build/outputs/mapping/release/mapping.txt
```

Upload it as part of the release job. See [Crash Reporting](../debugging/crash-reporting.md) and
[Reading a Release Stack Trace](../debugging/release-stack-traces.md).

## What obfuscation does not do

State these plainly whenever someone proposes obfuscation as a security measure.

- **It is not encryption.** There is no key and nothing is hidden. R8 renames symbols; the
  bytecode remains executable and therefore readable.
- **String constants survive.** Every URL, error message, feature flag name, header name and API
  path is still in the binary in the clear, on both the Java and the JavaScript side.
- **Decompilers work fine on obfuscated code.** `jadx` produces readable Java from an R8 build in
  seconds. The names are meaningless, the structure is not.
- **It does not stop repackaging.** Modifying and resigning an APK is unaffected by renaming.
- **It does not protect the Hermes bundle.** R8 never looks at `assets/index.android.bundle`.
- **It is not a substitute for a single one of the controls above it** in the
  [threat model](threat-model.md) table. An app with a hardcoded API key and full R8 obfuscation
  has a hardcoded API key.

The honest summary: obfuscation turns a fifteen-minute read into a two-hour read for someone who
already decided to look. That is worth something against opportunistic attackers and worth
nothing against a targeted one.

## Verification

### 1. Confirm R8 actually ran

```bash
# A build where R8 ran writes a mapping file with real entries.
wc -l android/app/build/outputs/mapping/release/mapping.txt

# And the class names in the APK should be short.
unzip -o app-release.apk -d extracted
# dexdump is in the Android build-tools.
dexdump -f extracted/classes.dex | head -40
```

An empty or missing mapping file means `minifyEnabled` is not doing what you think.

### 2. Decompile your own release build

This is the calibration exercise. Do it once so nobody on the team overestimates the control.

```bash
# jadx is a standalone decompiler; point it at your release APK.
jadx -d out app-release.apk
grep -rn "example.com\|api_key\|Bearer" out/ | head -40
```

You will find your endpoint strings immediately. You will find your logic with more effort. Both
outcomes are the point.

### 3. Confirm the strings are untouched

```bash
strings -n 8 extracted/assets/index.android.bundle | grep -c .
strings -n 8 extracted/lib/arm64-v8a/*.so | grep -iE "example\.com" | head
```

Compare the counts before and after enabling R8. They will be the same, because R8 does not
process either file.

### 4. Test the release build as a real build

Every R8-related bug appears only in the minified variant. A release smoke test that exercises
every serialisation path and every native module is not optional once shrinking is on. Wire it
into [CI for Mobile](../testing/ci-for-mobile.md) and run it on the artifact you are going to
ship, not on a debug build.

## Common mistakes

- **Believing the JavaScript is minified.** On a default Hermes build it is not — React Native
  passes `--minify false`. Check before you cite it as a control.
- **Calling obfuscation "encryption" in a security review.** It renames symbols. Anyone reviewing
  the answer will know.
- **Enabling R8 the week of a release.** Every reflection bug it causes surfaces only in the
  release variant, and you will find them in production if you do not find them in testing.
- **Fixing an R8 crash with a blanket keep rule.** `-keep class ** { *; }` disables the feature
  you enabled. Keep the one class that broke.
- **Committing `mapping.txt`.** It is the de-obfuscation key for your shipped binary. Upload it to
  your crash reporter and your artifact store; keep it out of the repository.
- **Dropping `-keepattributes SourceFile, LineNumberTable`.** You keep the obfuscation and lose
  readable crash reports, which is the worst combination available.
- **Shipping a paid obfuscation product instead of fixing the bundle.** If a key is in the app,
  the key is compromised. Obfuscating it delays discovery, and discovery is the only reason you
  would ever get a chance to rotate it.
- **Assuming the iOS side is covered.** R8 is Android-only. iOS native code is compiled, which is
  a higher bar than bytecode, but `strings` works on Mach-O binaries too.

## Related topics

- [ProGuard and R8](../build-and-release/proguard-and-r8.md) — the full build configuration, keep rules and troubleshooting.
- [Why Secrets in JS Are Readable](secrets-in-the-bundle.md) — the demonstration that string constants survive everything here.
- [Threat Model](threat-model.md) — where obfuscation ranks, honestly.
- [Hermes](../core-concepts/hermes.md) — what bytecode is actually for.
- [Bundle Size](../performance/bundle-size.md) — the real reason to enable shrinking.
- [Reading a Release Stack Trace](../debugging/release-stack-traces.md) — using the mapping file you kept.
- [Root and Jailbreak Detection](root-and-jailbreak-detection.md) — the other control with a large gap between perception and value.
