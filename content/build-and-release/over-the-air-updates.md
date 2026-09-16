---
title: Over-the-Air Updates
description: What an OTA update can and cannot change in a React Native app, what Apple and Google actually permit, the state of the tooling after CodePush shut down, and how to evaluate an option yourself.
status: current
toolchain: cli
---

An over-the-air update replaces the JavaScript bundle and its assets in an installed app, without
going through App Review or a Play release. It is the most over-promised capability in the React
Native ecosystem, so this page starts with the boundary rather than the benefits.

**An OTA update can change your JavaScript bundle and your bundled assets. It can change nothing
else.** Not your native code, not a native dependency, not a permission, not an `Info.plist` key,
not the Hermes version. Every honest discussion of OTA starts there, and a surprising amount of
advice online does not.

## What is actually in scope

| Changes without a store release | Requires a new store build |
| --- | --- |
| Your JavaScript and TypeScript | Any Kotlin, Swift, Objective-C++ or C++ |
| Images and fonts bundled through Metro | Adding or upgrading a native dependency |
| Layout, copy, business logic, styling | A new permission in `AndroidManifest.xml` |
| A JavaScript-only bug fix | A new usage-description string in `Info.plist` |
| A feature built from components already linked into the binary | Upgrading React Native itself |
| Remote configuration your JavaScript reads | Changing the app icon, name or bundle id |

The second column is not a limitation of any particular tool. The native binary is signed and
installed by the platform; nothing your app downloads at runtime can change it.

There is a subtler version of the same rule that catches teams out: a JavaScript update that calls
a native module which is not in the shipped binary will install perfectly and then crash on the
first call. OTA changes what code runs, not what code exists.

> [!WARNING] The bundle must match the binary it lands in
> A JavaScript bundle built against React Native 0.87.1 is not interchangeable with one built
> against 0.86, and a Hermes bytecode bundle is tied to the bytecode version the shipped Hermes
> understands. Every OTA mechanism therefore has to gate updates by binary version. An update
> that reaches the wrong binary does not degrade — it fails to load, and your app is bricked until
> the user reinstalls.

## Why teams want it, and when it is the wrong answer

The real motivation is almost always latency: a bad release is live, App Review takes days, and a
one-line fix is sitting in a branch. OTA turns that into minutes.

It is the wrong answer when:

- **The fix is native.** No OTA mechanism can deliver it. You need a store release regardless.
- **You would use it to ship features continuously.** That is the use both stores' policies are
  written to restrain, and it is the use most likely to get an app pulled.
- **You do not have staged rollout and rollback.** An OTA channel without a kill switch is a way to
  break 100% of your users in 30 seconds instead of over a week.
- **Play's own staged rollout would do.** Play can hold a release at 1% and halt it. That covers a
  large share of what people reach for OTA to achieve, with no extra infrastructure and no policy
  risk. See [AAB and Play Store Submission](play-store-submission.md).

## What the stores actually permit

This is the part that determines whether you can use OTA at all, and it is worth reading the
primary sources rather than a blog summary. Both policies change; the text below was read on
2026-09-12.

### Apple

App Review guideline **2.5.2** requires apps to be self-contained in their bundles and does not
permit downloading, installing or executing code that introduces or changes features or
functionality. Read on its own, that is a flat prohibition.

The narrower allowance lives in the **Apple Developer Program License Agreement**, section
**3.3.2**, which has historically permitted interpreted code to be downloaded provided it does not
change the primary purpose of the app — with the exception carved out for scripts and code run by
Apple's built-in WebKit framework or JavaScriptCore, and provided the app's functionality stays
consistent with what was submitted and advertised.

Two honest observations follow, and you should weigh both yourself rather than take a
documentation page's word for it:

1. **React Native 0.87 runs on Hermes, not JavaScriptCore.** The agreement's explicit carve-out
   names Apple's own engines. Shipping JavaScript updates to a Hermes app is widespread industry
   practice and has been for years; it is not something Apple has written down as permitted.
2. **"Does not change the primary purpose" is the operative constraint either way.** Bug fixes and
   tweaks to an existing feature sit comfortably inside it. Shipping a new product through an OTA
   channel to avoid review does not.

Read the current text yourself before you build on it:
[App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) and the
[Apple Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/).

### Google

Play's **Device and Network Abuse** policy states that an app distributed via Google Play may not
modify, replace or update itself by any method other than Play's update mechanism — and then
explicitly exempts code that runs in a virtual machine or an interpreter providing indirect access
to Android APIs, giving JavaScript in a WebView as the example.

A JavaScript bundle interpreted by Hermes is the same shape of thing as that exemption describes,
and Play has not treated React Native OTA as a violation in practice. Downloading and executing
**native** code — a `.so`, a `.dex`, a `.jar` — is squarely prohibited, with no exemption.

Primary source:
[Device and Network Abuse](https://support.google.com/googleplay/android-developer/answer/9888379).

> [!DANGER] Do not use OTA to bypass review
> Both policies are written against apps that present one thing for review and become another
> afterwards. An update that adds a feature the reviewed build did not have, changes what the app
> is for, or enables functionality that was hidden during review is the case the rules exist to
> catch. The consequence is not a rejected update — it is removal of the app and, in the worst
> case, of the developer account.

## The state of the tooling

This is where most advice you will find is out of date, so it needs saying plainly.

### CodePush and App Center are gone

| Fact | Verified on 2026-09-12 |
| --- | --- |
| Visual Studio App Center was retired on **31 March 2025** | Microsoft's own retirement notice |
| CodePush, as an App Center service, was retired with it | Same notice |
| `microsoft/react-native-code-push` is **archived and read-only** | The repository itself |
| Its README states the plugin **will not support the New Architecture** | The repository's README |
| The npm package `react-native-code-push` is at **9.0.1**, last published **2024-12-19** | `npm view react-native-code-push version` |

That last row and the one above it are the ones that settle it for this handbook. React Native
0.82 and later run *only* on the New Architecture — the opt-out flags are ignored — so a plugin
that requires opting out of it cannot work on 0.87 at all. `react-native-code-push` is not a
legacy-but-workable option. It is a dead end.

> [!DANGER] Do not adopt CodePush in 2026
> If you find a tutorial that tells you to install `react-native-code-push`, stop reading it — it
> predates both the App Center retirement and the removal of the old architecture. If your existing
> app still calls an App Center CodePush endpoint, it has not received an update since the service
> was switched off, and you should remove the client and plan a store release.

### There is no first-party replacement on the CLI path

React Native itself does not ship an update service, and the Community CLI has no OTA command.
Everything available is third-party: a hosted service, a self-hosted open-source server with a
client library, or something you build.

**This handbook does not name a recommended one.** That is a deliberate choice rather than an
omission. Verifying the packages currently published under OTA-related names on 2026-09-12, none of
them declares a `react-native` peer dependency range that names 0.87 — the ranges are either absent
or `*`, which proves nothing about compatibility. Recommending a package on that basis would be
guessing, and a wrong recommendation here means a bricked install base.

So the useful thing this page can give you is a way to evaluate whatever you find.

## How to evaluate an OTA option

Run these checks against any candidate, in this order. The first four are mechanical and take about
ten minutes.

```bash
# 1. Is it alive, and does it say anything about React Native compatibility?
npm view <package> version time.modified peerDependencies

# 2. Does it ship a Codegen spec, i.e. is it a TurboModule rather than a
#    legacy-architecture module? A package with no codegenConfig and no
#    New Architecture story will not work on 0.87.
npm view <package> codegenConfig

# 3. Is the client actually maintained, or was the last release two years ago?
npm view <package> time --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const t=JSON.parse(s);console.log(Object.entries(t).slice(-6))})"

# 4. Does installing it pull in a framework you are not using?
npm view <package> peerDependencies dependencies
```

Then the questions that no registry query answers:

| Question | Why it decides the outcome |
| --- | --- |
| Does it gate updates by **binary version**? | Without this, a bundle reaches a binary it was not built for and the app fails to start |
| Does it **verify a signature** on the downloaded bundle? | Without this, anyone who can intercept the update channel executes code in your app |
| Does it support **staged rollout** and an **instant rollback**? | A bad OTA update reaches everyone in minutes; you need a way to stop it in seconds |
| Does it **roll back automatically** when the new bundle crashes on launch? | This is the difference between a bad update and an unrecoverable one |
| Where is the update **hosted**, and who controls it? | It is a code-execution channel into every installed app. Treat it like production infrastructure |
| Can you **self-host** it? | A hosted vendor that shuts down takes your update channel with it — which is precisely what happened to CodePush |
| Does the client work with **Hermes bytecode** bundles? | A plain-JavaScript-only client throws away Hermes's startup benefit |
| What is the **licence**, and is there a maintained fork if the maintainer stops? | One-maintainer infrastructure is a risk you are accepting on behalf of every user |

If a candidate fails the signature question or the automatic-rollback question, it is not a
production option regardless of how convenient it is.

## What building the bundle looks like

Whatever mechanism you use, the artefact is the same one your release build embeds, and you can
produce it with the CLI. This is worth knowing even if you never build your own updater, because it
is how you inspect what an OTA update would actually contain.

```bash
# Android. --dev false disables warnings and enables minification.
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output build/index.android.bundle \
  --assets-dest build/android-assets \
  --sourcemap-output build/index.android.bundle.map
```

```bash
# iOS. Same command, different platform and output names.
npx react-native bundle \
  --platform ios \
  --dev false \
  --entry-file index.js \
  --bundle-output build/main.jsbundle \
  --assets-dest build/ios-assets \
  --sourcemap-output build/main.jsbundle.map
```

Those flags are all real options of `bundle` in React Native 0.87.1 — `--entry-file`, `--platform`,
`--dev`, `--minify`, `--bundle-output`, `--assets-dest`, `--sourcemap-output`,
`--sourcemap-sources-root`, `--max-workers`, `--reset-cache`, `--config` and
`--unstable-transform-profile` among them. The full list is in
[CLI Command Reference](../reference/cli-reference.md).

Two things the bundle command does **not** do, and which an updater has to handle:

1. **It does not produce Hermes bytecode.** The Gradle and Xcode build phases run `hermesc` over the
   bundle afterwards. An OTA payload that ships plain JavaScript to a Hermes app works, but pays
   the parse cost on every launch that the shipped bundle does not — see
   [Hermes and Bytecode](../performance/hermes-and-bytecode.md).
2. **It does not version anything.** Matching a bundle to the binaries it is safe for is entirely
   the updater's job, and it is the part that goes wrong.

> [!NOTE] The native half is unavoidable
> Downloading a bundle, storing it, pointing the app's bundle loader at it on next launch, and
> rolling back when it fails are all native operations — a Kotlin/Swift TurboModule at minimum. You
> cannot build an OTA mechanism in JavaScript alone, which is why "just fetch the bundle and
> `eval` it" advice does not survive contact with a release build.

## Security considerations

### Threat

An OTA channel is a remote code execution path into every installed copy of your app, by design.
The attacker's goal is to get their JavaScript to run instead of yours. Two realistic routes:

1. **Compromise the update server or its storage bucket.** Replace the bundle; every client that
   checks in executes it.
2. **Intercept the update fetch.** On a hostile network, or with a device that trusts an attacker's
   CA, serve a different bundle in response to the update check.

The payload runs with your app's identity: its keychain entries, its session tokens, its
permissions, its network trust.

### Exploit

```bash
# What an attacker inspects first: is the update itself authenticated, or only
# the transport? Watch the update check from a proxy.
#
# If the response body is a bundle plus a URL, and nothing in the payload is
# signed, then whoever controls that URL controls your app's code.
```

```bash
# And what a bundle gives up once obtained — the same extraction that works on a
# shipped app works on an intercepted update.
strings build/index.android.bundle | grep -iE 'api[_-]?key|secret|token' | head
```

### Fix

1. **Sign the bundle, verify in the client.** Transport security (HTTPS) proves who you are talking
   to. A signature proves the bundle came from your build pipeline. You need both; an updater that
   offers only the first is offering half.
2. **Pin the update check to your own domain** and treat the signing key like a release key — see
   [Android Signing](android-signing.md) for how not to store one.
3. **Gate strictly by binary version**, and refuse anything outside the range.
4. **Roll back automatically on a launch crash.** A bundle that throws before the first render must
   be discarded and the embedded bundle restored, or the user has no path back short of a
   reinstall.
5. **Never treat the OTA channel as a secrets channel.** Everything in the bundle is readable, on
   an OTA payload exactly as much as in the shipped binary. See
   [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md).
6. **Log and alert on update-server changes** the same way you would for a production deploy,
   because that is what it is.

### Verification

```bash
# 1. Confirm the client rejects an unsigned or wrongly signed bundle: serve one
#    from a local server and check the app refuses it rather than running it.

# 2. Confirm the version gate: serve a bundle built for a different React Native
#    version and check the client declines it instead of bricking.

# 3. Confirm rollback: ship a bundle whose entry point throws immediately, and
#    verify the app recovers to the embedded bundle on the next launch.
```

Those three are the tests worth automating, because all three failure modes are unrecoverable from
the user's side. If you cannot run them against a candidate tool, you do not know whether it is
safe to use.

## Performance considerations

- **Every launch that checks for an update pays for it.** Do the check after first render, not
  before it, or you have added network latency to your cold start. See
  [Startup Time](../performance/startup-time.md).
- **A downloaded plain-JavaScript bundle is slower to start than the shipped Hermes bytecode.** The
  gap is largest on low-end Android. Measure it rather than assuming it is negligible.
- **Applying on next launch is the only safe moment.** Swapping the bundle in a running app means
  reloading the whole React tree and discarding state, which users experience as a crash.
- **Bundle size is download size, per user, per update.** Differential updates help; most simple
  implementations do not do them.

## What to do instead, or as well

OTA is not the only way to shorten the gap between finding a bug and fixing it for users.

| Approach | What it covers | Cost |
| --- | --- | --- |
| **Play staged rollout** | Halting a bad Android release before it reaches everyone | None; it is built into Play |
| **Phased release on App Store** | The same on iOS, over seven days, pausable | None; built into App Store Connect |
| **Server-driven feature flags** | Turning a broken feature off without any client change | A flag service and the discipline to use it |
| **Server-driven content and configuration** | Copy, endpoints, limits, layout metadata | Design work, and a schema you version |
| **A faster release pipeline** | Everything, permanently | CI investment — see [CI Pipelines](ci-pipelines.md) |

A flag that disables the broken screen is usually a better answer than an OTA update that fixes it,
because it is smaller, instantly reversible, and carries no policy question at all.

## Common mistakes

- **Believing OTA can update native code.** Wrong: shipping a JavaScript update that calls a module
  the installed binary does not contain. Right: a store release. The update installs and then
  crashes at the first call.
- **Adopting `react-native-code-push` in 2026.** The service was retired in March 2025, the
  repository is archived, and its own README says it does not support the New Architecture — which
  is the only architecture from 0.82 onward.
- **Using an OTA channel to avoid App Review.** Both stores' policies are aimed exactly at this.
  The downside risk is app removal, not a rejected update.
- **Shipping without a binary-version gate.** Wrong: one update channel for all versions. Right: a
  bundle is only valid for the binaries it was built against. The failure mode is an app that will
  not start.
- **HTTPS without a bundle signature.** Transport security protects the channel; it does not prove
  the bundle came from your pipeline. A compromised bucket serves malicious code over a perfectly
  valid TLS connection.
- **No automatic rollback on a launch crash.** A bundle that throws before first render leaves the
  user with an app that cannot recover, and no amount of force-quitting helps.
- **Applying an update mid-session.** It discards state and looks like a crash. Apply on next
  launch.
- **Checking for updates during startup, synchronously.** You have added a network round trip to
  your cold start for every user, forever.
- **Treating an OTA payload as private.** It is as readable as the shipped bundle. Secrets do not
  belong in either.
- **Choosing a tool from a blog post rather than from the registry.** Run
  `npm view <pkg> version peerDependencies` yourself. In this corner of the ecosystem, a two-year-old
  recommendation is usually a dead one.

## Related topics

- [AAB and Play Store Submission](play-store-submission.md) — staged rollout, which covers much of what OTA is reached for.
- [TestFlight and App Store Submission](app-store-submission.md) — phased release and what App Review actually looks at.
- [CI Pipelines](ci-pipelines.md) — shortening the release loop, which is the durable version of this problem.
- [Versioning Strategy](versioning.md) — the binary version an update has to be gated against.
- [Hermes and Bytecode](../performance/hermes-and-bytecode.md) — why a downloaded plain-JavaScript bundle starts slower.
- [Startup Time](../performance/startup-time.md) — where an update check belongs in the launch sequence.
- [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md) — the bundle is readable, however it arrives.
- [Certificate Pinning](../security/certificate-pinning.md) — protecting the channel the update arrives on.
- [Environment Configuration](environment-configuration.md) — build-time configuration, and why it is not a substitute.
- [Release Checklist](release-checklist.md) — where an update check belongs in a release.
- [Native Dependency Compatibility](../migration/native-dependency-compatibility.md) — the method used above to judge a package.
