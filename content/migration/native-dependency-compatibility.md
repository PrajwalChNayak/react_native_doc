---
title: Native Dependency Compatibility
description: How to determine whether a library actually supports React Native 0.87 and the New Architecture, before you depend on it.
status: current
toolchain: cli
---

`npm install` succeeding tells you nothing about whether a native library works. npm resolves
JavaScript; it does not compile Kotlin, it does not run Codegen, and it does not check that a view
manager can be mounted by Fabric. A package with no New Architecture support installs perfectly and
then fails when a screen mounts or a method is called.

This page is the method for finding that out in advance. It takes about two minutes per package and
it is the highest-value check you can run before an upgrade.

> [!WARNING] A library without Fabric / TurboModule support is not a valid choice
> Since 0.82 there is no legacy architecture to fall back to. Interop layers may carry an unmigrated
> library for a while, but they are a shim over classes that are being deleted. Treat "has not
> migrated" as "do not adopt", not as "adopt carefully".

## Why it exists / when to use it — and when NOT to

Run this check in three situations: before adding a new native dependency, before starting an
upgrade, and when something that installed cleanly behaves strangely at runtime.

You do not need it for pure-JavaScript packages. A date library, a validation library, a state
manager — anything with no `android/`, `ios/` or `*.podspec` in its published files — has no native
side to be incompatible. `zustand` and `@tanstack/react-query` are in this category; they are listed
in this handbook's verified table because their versions were checked, not because they carry native
code.

## The four-step check

### Step 1 — read the peer dependencies

```bash
npm view react-native-reanimated version peerDependencies
```

A well-maintained native library declares a `react-native` peer range, and that range is the
maintainer telling you which versions they test. Real output shape, for two packages verified for
this handbook:

| Package | Version | `react-native` peer |
| --- | --- | --- |
| `react-native-reanimated` | 4.6.0 | `0.83 - 0.87` |
| `react-native-worklets` | 0.12.2 | `0.83 - 0.87` |

A range that stops below 0.87 is a direct statement that 0.87 is untested. A package with **no**
`react-native` peer at all is weaker evidence, not stronger — it usually means the field was never
maintained rather than that every version works.

Check the other peers too, because missing ones are the most common install-time surprise:

```bash
npm view react-native-mmkv version peerDependencies
# react-native-nitro-modules is a REQUIRED peer — MMKV 4 is built on Nitro Modules.

npm view react-native-reanimated version peerDependencies
# react-native-worklets 0.12.x is a REQUIRED peer — Reanimated 4 does not bundle
# the worklets runtime, and installing Reanimated alone gets you a build that
# fails at runtime rather than at install time.
```

### Step 2 — look for a Codegen config

This is the strongest single signal. A library that has migrated to the New Architecture declares a
`codegenConfig` block in its `package.json`:

```bash
cat node_modules/react-native-screens/package.json | node -e "
  let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
    const p=JSON.parse(s);
    console.log('name:', p.name, p.version);
    console.log('codegenConfig:', JSON.stringify(p.codegenConfig ?? null, null, 2));
  })"
```

A `codegenConfig` looks like this, and its `type` tells you what the library provides:

```json title=A migrated library's package.json (excerpt)
{
  "codegenConfig": {
    "name": "rnscreens",
    "type": "all",
    "jsSrcsDir": "src/fabric",
    "android": {"javaPackageName": "com.swmansion.rnscreens"}
  }
}
```

| `type` | Means |
| --- | --- |
| `modules` | TurboModules only |
| `components` | Fabric components only |
| `all` | Both |

No `codegenConfig` and no spec files means the library has not migrated. If it ships native code
anyway, it is running through an interop layer.

### Step 3 — find the spec files

`codegenConfig.jsSrcsDir` points at the directory holding the library's specs. Confirm they exist and
look at one:

```bash
ls node_modules/<pkg>/src/specs 2>/dev/null
grep -rln "TurboModuleRegistry\|codegenNativeComponent" node_modules/<pkg>/src | head
```

A TurboModule spec uses `TurboModuleRegistry`; a Fabric component spec uses
`codegenNativeComponent`. Finding neither, in a package that ships an `android/` directory, is
conclusive.

A quick sweep across everything installed:

```bash
for d in node_modules/*/ node_modules/@*/*/; do
  if [ -d "$d/android" ] || ls "$d"*.podspec >/dev/null 2>&1; then
    if node -e "process.exit(require('./$d/package.json').codegenConfig?0:1)" 2>/dev/null; then
      echo "OK       $d"
    else
      echo "NO CODEGEN  $d"
    fi
  fi
done
```

Every `NO CODEGEN` line is a package with native code and no Codegen config. Investigate each — some
legitimately need none (a library that only ships a Gradle dependency or an asset bundle), but most
have simply not migrated.

### Step 4 — check the repository

The registry tells you what was published; the repository tells you whether anyone is still there.

- **Recent releases.** `npm view <pkg> time.modified` and `npm view <pkg> versions --json | tail`.
  A package whose last release predates React Native 0.82 has not been tested against a bridgeless
  runtime.
- **Open issues mentioning your version.** Search the issue tracker for "0.87", "New Architecture",
  "Fabric", "bridgeless". A thread with a maintainer answer is reassuring; a thread with fifty
  thumbs-up and no answer is not.
- **The README's compatibility table.** Well-run native libraries keep one.
- **A `newArchSupport` note or a migration changelog entry.** Many libraries documented the release
  in which they added it.

```bash
npm view <pkg> time.modified repository homepage
npm view <pkg> dist-tags
```

## Basic example — auditing before an upgrade

```bash
# 1. What do you actually depend on?
npm ls --depth=0

# 2. For each native one, the two facts that matter.
for p in react-native-screens react-native-safe-area-context react-native-svg; do
  echo "=== $p"
  npm view "$p" version peerDependencies
  node -e "console.log('codegenConfig:', !!require('./node_modules/$p/package.json').codegenConfig)"
done
```

Sort the results into three piles and treat them differently:

| Pile | Signal | Action |
| --- | --- | --- |
| Fine | Peer range includes 0.87, `codegenConfig` present, released recently | Nothing |
| Needs a bump | `codegenConfig` present, peer range stops short | Upgrade the library first, then React Native |
| Needs replacing | No `codegenConfig`, no recent release | This is your project plan. Find a successor before you upgrade |

The third pile is the one that decides your schedule. Discovering it on day one of an upgrade is
cheap; discovering it on day four is not.

## Verified library versions

These were read from the npm registry for this handbook and checked for 0.87 and New Architecture
support. Use them as a starting point, and re-verify with `npm view` rather than trusting a table's
age.

| Package | Version | Notes |
| --- | --- | --- |
| `@react-navigation/native` | 7.3.18 | |
| `@react-navigation/native-stack` | 7.18.10 | |
| `@react-navigation/bottom-tabs` | 7.18.18 | |
| `@react-navigation/drawer` | 7.13.10 | |
| `@react-navigation/elements` | 2.9.40 | |
| `react-native-screens` | 4.27.0 | |
| `react-native-safe-area-context` | 5.9.1 | |
| `react-native-reanimated` | 4.6.0 | Peer `react-native` `0.83 - 0.87`. **Requires `react-native-worklets@0.12.x` as a separate install** |
| `react-native-worklets` | 0.12.2 | Peer `react-native` `0.83 - 0.87` |
| `react-native-gesture-handler` | 3.3.0 | |
| `react-native-svg` | 15.15.5 | |
| `@shopify/flash-list` | 2.3.2 | |
| `react-native-mmkv` | 4.3.2 | **Requires peer `react-native-nitro-modules`** |
| `@react-native-async-storage/async-storage` | 3.1.1 | |
| `react-native-keychain` | 10.0.0 | |
| `@tanstack/react-query` | 5.102.8 | Pure JavaScript |
| `zustand` | 5.0.15 | Pure JavaScript |
| `@testing-library/react-native` | 14.0.1 | Peers: `jest >=29`, `react >=19`, `react-native >=0.78`, `test-renderer ^1.0.0` |
| `detox` | 20.51.4 | |
| `react-native-config` | 1.7.2 | |
| `react-native-permissions` | 5.6.1 | |
| `@notifee/react-native` | 9.1.8 | |
| `react-native-vision-camera` | 5.2.3 | |
| `react-native-webview` | 14.0.1 | |
| `@react-native-community/netinfo` | 12.0.1 | |

### Two traps almost every tutorial gets wrong

**Reanimated 4 does not bundle the worklets runtime.** It declares
`react-native-worklets: 0.12.x` as a peer, and you must install it yourself and add the plugin to
`babel.config.js`. Installing Reanimated alone produces a build that compiles and then fails at
runtime with a worklets error.

```bash
npm install react-native-reanimated@4.6.0 react-native-worklets@0.12.2
```

**MMKV 4 is built on Nitro Modules.** `react-native-nitro-modules` is a required peer. Missing it
produces a native module that cannot be found.

```bash
npm install react-native-mmkv@4.3.2 react-native-nitro-modules
```

## How it works — why "it installs" proves nothing

Three separate systems have to agree for a native library to work, and npm participates in only the
first.

1. **npm resolves JavaScript.** It reads `package.json`, downloads a tarball, and warns about peer
   ranges it cannot satisfy. It never looks at `android/` or `ios/`.
2. **Autolinking wires the native code in.** `@react-native-community/cli` scans your dependencies
   for native projects and adds them to the Gradle build and the Podfile. This is when a missing
   native dependency becomes a build error — and it is also when an unmigrated library gets attached
   to an interop layer rather than being rejected.
3. **Codegen generates the interfaces.** At build time React Native reads every `codegenConfig` and
   emits the C++, Kotlin and Objective-C declarations the native side must satisfy. A library with no
   `codegenConfig` contributes nothing here, and its native code is reached the old way through a
   shim.

The failure you get depends on which step fell over:

| Symptom | Usually means |
| --- | --- |
| `npm ERR! peer dep missing` | Step 1. Install the peer |
| Gradle or Xcode fails to find a symbol | Step 2. Stale build — clean and reinstall native dependencies |
| Invariant at runtime: native module not found | The module is not linked, or the spec name does not match the native registration |
| A view renders as an empty box | A legacy view manager reached through interop, or a Fabric component whose native side is missing |
| It works in debug and crashes in release | A native dependency excluded by the release build config, or code stripped by R8 |

## Platform differences

A library can support one platform and not the other, and nothing in `npm ls` says so.

:::tabs
@tab iOS
Check for a `.podspec` in the published package. If you are on the experimental Swift Package Manager
path, check for a `Package.swift` as well — a podspec-only library cannot be consumed by SPM. See
[CocoaPods to Swift Package Manager](cocoapods-to-spm.md).

```bash
ls node_modules/<pkg>/*.podspec node_modules/<pkg>/Package.swift 2>/dev/null
```

Verifying an iOS build requires macOS.
@tab Android
Check for an `android/` directory with a `build.gradle`. Look at its `compileSdk` and Kotlin version:
React Native 0.87 targets `compileSdk` 37 with `minCompileSdk` 34 and Kotlin 2.0 or newer. A library
pinned to an older Kotlin can fail to compile against the bundled 2.2.0.

```bash
grep -n "compileSdk\|kotlinVersion\|kotlin_version" node_modules/<pkg>/android/build.gradle
```
:::

A library's `react-native.config.js` can also declare that it supports only one platform, which is
worth reading before you assume parity.

## Performance considerations

- **Every linked native library costs install size**, whether you call it or not. TurboModules removed
  the *startup* cost of unused modules, not the bytes.
- **A library on the interop layer pays a translation cost** on every call and on construction. If
  startup time matters, the unmigrated dependencies are the first place to look.
- **Auditing is cheap; discovering late is not.** Two minutes per package during planning versus days
  of an upgrade blocked by one dependency with no successor.

## Security considerations

**Threat.** A native dependency runs with your app's full privileges. It can read the keychain, open
network connections, and access anything the app is permitted to access. An abandoned package is also
an attractive takeover target: an attacker who acquires publish rights ships a version that does
whatever they like, to everyone who runs `npm install`.

**Exploit.** Concretely: a transitive native dependency adds a post-install step or native code that
exfiltrates data. You never read its source, because you never chose it — it arrived under something
you did choose. Because it is native, no amount of JavaScript review would have found it.

**Fix.**

- Prefer fewer, better-maintained native dependencies. Each one is a supply-chain entry point that
  JavaScript review cannot inspect.
- Commit the lockfile and use `npm ci`, so a build cannot silently resolve a new version.
- Audit what you have, and look at what is native rather than only at what is direct:

```bash
npm audit --omit=dev
npm ls --all --json | node -e "
  let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
    const seen=new Set();
    (function walk(n){for(const [k,v] of Object.entries(n.dependencies??{})){
      if(!seen.has(k)){seen.add(k);}
      walk(v);}})(JSON.parse(s));
    console.log(seen.size, 'packages in the tree');
  })"
```

- Review the diff when a native dependency changes version, not just the changelog.

**Verification.** After a dependency change, confirm nothing new appeared in the native build:

```bash
npx react-native config | node -e "
  let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
    const c=JSON.parse(s);
    console.log(Object.keys(c.dependencies ?? {}).sort().join('\n'));
  })"
```

`react-native config` prints the CLI's resolved configuration, including exactly which dependencies
autolinking will wire into the native build. Diff that list between two commits and anything new is
new native code in your app. See [Dependency Auditing](../security/dependency-auditing.md).

## Common mistakes

- **Treating a clean `npm install` as compatibility.** Wrong: installing and moving on. Right: check
  `codegenConfig` and the `react-native` peer range. npm never looks at the native side.
- **Installing Reanimated without worklets.** Wrong: `npm i react-native-reanimated`. Right: install
  `react-native-worklets@0.12.2` alongside it and add the Babel plugin. Reanimated 4 declares it as a
  peer and does not bundle it.
- **Installing MMKV without Nitro Modules.** Wrong: `npm i react-native-mmkv`. Right: add
  `react-native-nitro-modules`. MMKV 4 is built on it.
- **Ignoring a peer-dependency warning.** Wrong: scrolling past it. Right: read it. In a native
  library, an unmet peer is usually a missing native runtime, and the failure lands at runtime on a
  device rather than at install time on your machine.
- **Auditing after the upgrade starts.** Wrong: upgrading first and finding the blocker on day four.
  Right: inventory while the app still builds, when you still have a rollback.
- **Assuming a big download count means maintained.** Wrong: picking by popularity. Right: check
  `time.modified` and the issue tracker. A package can be enormously popular and two years behind the
  runtime.
- **Only checking your direct dependencies.** Wrong: reading `package.json`. Right: walk the tree.
  Native code arrives transitively, and it is linked into your app just the same.

## Related topics

- [New Architecture Migration](new-architecture-migration.md) — the inventory step in the context of a full migration.
- [The Upgrade Helper Workflow](upgrade-helper-workflow.md) — where this audit fits in an upgrade.
- [0.87 Breaking Changes](breaking-changes-087.md) — what else the upgrade will ask of you.
- [CocoaPods to Swift Package Manager](cocoapods-to-spm.md) — the extra `Package.swift` requirement on that path.
- [Autolinking and react-native.config.js](../native-modules/autolinking.md) — how a native dependency reaches your build.
- [Codegen and Spec Files](../native-modules/codegen-specs.md) — what `codegenConfig` actually drives.
- [Dependency Auditing](../security/dependency-auditing.md) — the supply-chain side of the same question.
- [Troubleshooting](../reference/troubleshooting.md) — the runtime symptoms an incompatible library produces.
