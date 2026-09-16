---
title: Crash Reporting
description: Getting errors from devices you do not own — what a crash reporter has to cover in a React Native app, how to choose one, and how to wire your app so the choice is reversible.
status: current
toolchain: cli
---

Everything else in this section is a tool you point at a device in front of you. Crash reporting is
the one that works on the ten thousand devices you will never touch. It is also the only way to
learn that a bug exists at all: users do not file tickets, they uninstall.

A React Native app fails in three distinct ways, and a reporting setup that covers only one of them
gives you a clean dashboard and a one-star review page full of crashes you cannot see.

## Why it exists / when to use it — and when NOT to

The platform stores already give you something. Google Play Console and App Store Connect both
collect native crashes and ANRs from real installs, for free, with no SDK. That is a real baseline
and you should be reading it.

What the stores do not give you:

- **JavaScript errors**, unless they escalated into a process crash.
- **Non-fatal errors** — the ones a boundary caught and recovered from, which are most of them.
- **Context**: what screen, what request, what the user tapped, which feature flag.
- **Timeliness**: store reporting is aggregated and delayed. You want to know within minutes of a
  bad release, not the next morning.
- **Release health**: what share of sessions on version 3.4.1 are crash-free, compared with 3.4.0.

That gap is what a crash reporting service fills.

**When not to reach for one:** for a bug you can reproduce on your desk. Crash reporting is for
failures you cannot reproduce, on builds you cannot attach to. Reproducible bugs belong in
[React Native DevTools](react-native-devtools.md), which is faster and tells you more.

## The three failure classes

Any reporting setup should be evaluated against this table, because a tool that only covers the
first row is common and insufficient.

| Failure | Example | What has to catch it |
| --- | --- | --- |
| **Fatal JavaScript error** | An error escapes every boundary; the runtime cannot continue | The global JavaScript handler, plus the reporter's own hook |
| **Non-fatal JavaScript error** | An [error boundary](error-boundaries.md) caught a render error; a rejected promise | Your own reporting calls |
| **Native crash** | A signal in native code — a null dereference in a native module, an out-of-memory kill | A native crash handler installed by the SDK, or the store console |

Two things are commonly missed here:

- **Unhandled promise rejections raise `console.error` since 0.82.** They do not crash the app and
  they do not pass through the global error handler. If your reporter forwards `console.error`, they
  appear; if it does not, they are invisible. Decide which, deliberately.
- **ANRs and hangs are not crashes.** The app is alive and unresponsive. Only the platform stores,
  or a reporter with explicit hang detection, see these. See
  [Native Crash Logs](native-crash-logs.md).

## Basic example — wire a seam, not an SDK

Whatever you choose, call it through one module of your own. This is not ceremony: crash reporting
vendors get acquired, change pricing, and change APIs, and an app that calls an SDK from two hundred
files cannot change its mind.

```ts title=src/errors/reporter.ts
import 'react-native';

export type Severity = 'fatal' | 'error' | 'warning';

export type ReportContext = {
  /** Where in the app this happened — a screen name or a boundary name. */
  scope: string;
  /** Small, non-identifying key/values. Never a request body or a token. */
  extra?: Record<string, string | number | boolean>;
};

/**
 * The single seam. Every call site in the app goes through here, so swapping
 * the vendor is one file, and so redaction and sampling have one home.
 */
export const reporter = {
  captureError(error: unknown, severity: Severity, context: ReportContext): void {
    const normalised = error instanceof Error ? error : new Error(String(error));

    if (__DEV__) {
      // In development, the local tools are better than any dashboard.
      console.error(`[${severity}] ${context.scope}`, normalised, context.extra);
      return;
    }

    // Replace with your chosen SDK's capture call. Keep the shape: one
    // normalised Error, one severity, one small context object.
    void normalised;
  },

  /** A trail of what happened before the failure. Cheap, and the most useful field in a report. */
  addBreadcrumb(message: string, data?: Record<string, string | number | boolean>): void {
    void message;
    void data;
  },

  /**
   * A stable, app-generated identifier. NOT an email, phone number or name —
   * see the security section.
   */
  setUser(anonymousId: string | null): void {
    void anonymousId;
  },
};
```

Then the three call sites, each covering one row of the table above:

```ts title=src/errors/install.ts
import 'react-native';

declare const reporter: {
  captureError(
    error: unknown,
    severity: 'fatal' | 'error' | 'warning',
    context: {scope: string},
  ): void;
};

/**
 * Install as early as possible — the top of index.js, before the app registers.
 * Anything that throws before this line is handled by the default handler only.
 */
export function installCrashReporting(): void {
  const previousHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    reporter.captureError(error, isFatal === true ? 'fatal' : 'error', {scope: 'global'});

    // Always chain: the default handler is what shows the red box in
    // development and what produces a clean crash in release.
    previousHandler(error, isFatal);
  });
}
```

The third call site is your error boundary's `componentDidCatch`, which is written out in
[Error Boundaries](error-boundaries.md).

## How it works

### What makes a report useful

A stack trace alone rarely tells you what to fix. The fields that turn a report into a fix:

| Field | Why it matters |
| --- | --- |
| **Symbolicated stack** | Without it you have bytecode offsets. See [Source Maps](source-maps.md). |
| **Release identity** | `versionName` + `versionCode`, or `CFBundleShortVersionString` + `CFBundleVersion`. This is how a report is matched to a source map. |
| **Breadcrumbs** | The last N actions, screens and requests. Usually what actually reproduces the bug. |
| **Device and OS** | Crashes cluster hard by OS version and by manufacturer. |
| **Free memory / low-memory flag** | Distinguishes "bug" from "the OS killed us". |
| **Grouping** | Ten thousand reports of one bug must be one row, or the dashboard is unusable. |

### Symbolication is a build-time obligation

A crash reporter can only show you readable stacks if it has the symbol artefacts for that exact
build. Three separate things, one per layer:

| Layer | Artefact | Produced by |
| --- | --- | --- |
| JavaScript | the composed source map | the bundle step — see [Source Maps](source-maps.md) |
| Android native/Java | `mapping.txt` | R8 — see [ProGuard and R8](../build-and-release/proguard-and-r8.md) |
| iOS native | the `.dSYM` bundle | the Xcode archive — see [iOS Signing and Provisioning](../build-and-release/ios-signing.md) |

All three must be uploaded, or archived where you can find them, **in the same CI job that produced
the artifact**, keyed by the same version identifiers the app reports. A manual upload step is a
step that gets skipped on a hotfix, and the hotfix is the build whose crashes matter most. See
[CI Pipelines](../build-and-release/ci-pipelines.md).

### Choosing a reporter

Rather than recommending a vendor, here is the checklist to run any candidate against. Every item is
something a React Native app specifically needs and a generic reporter may not have:

1. **Does it declare support for React Native 0.87?** Check the registry yourself rather than
   trusting a marketing page:

   ```bash
   npm view <package> version peerDependencies
   ```

   A `react-native` peer range that includes `0.87` is the minimum. An open-ended range like
   `>=0.65.0` tells you it is *allowed* to install, not that it has been tested against the New
   Architecture.

2. **Does it work on the New Architecture?** React Native 0.82 and later run only on it, and the old
   Bridge is gone. A reporter whose native side was written against the Bridge either has been
   ported or does not work. Check the repository for a Fabric/TurboModule port and for recent
   releases, not just recent downloads.

3. **Does it catch native crashes, not just JavaScript?** This is the difference between a library
   and a crash reporter. Ask specifically about Android native signals and iOS `Mach` exceptions.

4. **Does it handle Hermes bytecode stack traces?** A reporter that expects web-style minified
   JavaScript will accept your source map and produce wrong line numbers. It must understand the
   composed map.

5. **Does it support ANRs / app hangs?** Or does it tell you honestly that it does not?

6. **How does it group?** Grouping quality is what makes the dashboard usable at scale, and it is
   the hardest thing to evaluate from the documentation. Test it with a deliberately triggered crash
   from three different code paths.

7. **What does it capture automatically?** Console output, request bodies, view hierarchies,
   device identifiers. Every one of those is a data-protection question. See the security section.

8. **What is the retention, and where is the data stored?** A crash report containing a token
   persists for as long as the report does, in whatever jurisdiction the vendor uses.

9. **Can you get your data out?** An export path matters when you change vendors, which you will.

> [!NOTE] What could be verified for this page
> On 2026-09-12, `npm view @sentry/react-native version peerDependencies` reported version
> **8.26.0** with a `react-native` peer range of `>=0.65.0` — which 0.87.1 satisfies. That is a
> registry fact about installability, and it is genuinely weaker evidence than a range that names
> 0.87. Other widely used reporters publish **no** `peerDependencies` at all, in which case the
> registry tells you nothing and you have to read their release notes and their native source.
> Run the check above for yourself, against the version you are about to install, and treat
> anything you read here or elsewhere as out of date.

### Do not build your own

It is tempting to POST errors to your own endpoint. The part you can build in an afternoon — send a
stack to a server — is the easy 10%. The rest is symbolication of three artefact types, grouping,
deduplication, native signal handlers that run safely inside a crashing process, offline queueing,
release health, and alerting. If your requirements genuinely forbid a third-party service, budget
accordingly rather than discovering this incrementally.

## Platform differences

The store consoles are the baseline you already have. Read them even with an SDK installed, because
they see crashes that happen before your SDK initialises.

:::tabs
@tab Android

**Play Console → Quality → Android vitals → Crashes and ANRs.**

- Reports come from installs on Play, including the internal and closed testing tracks.
- **ANRs are here and almost nowhere else.** An ANR is the app being unresponsive for several
  seconds, not crashing. It is a distinct metric with its own threshold, and exceeding it affects
  store visibility.
- Java and native stacks are deobfuscated only if you uploaded the R8 `mapping.txt` and the native
  debug symbols for that build. Gradle can attach both to the App Bundle automatically — see
  [ProGuard and R8](../build-and-release/proguard-and-r8.md) and
  [AAB and Play Store Submission](../build-and-release/play-store-submission.md).
- A JavaScript error that escalated to a crash appears here as a native crash inside the React
  Native runtime, with the JavaScript stack buried in the exception message. It is readable, barely,
  and it is the reason you want a JavaScript-aware reporter too.

@tab iOS

**Xcode → Window → Organizer → Crashes**, and **App Store Connect → your app → Metrics**.

- Reports come from users who opted in to sharing analytics with developers, so the volume is a
  sample rather than a census.
- Symbolication uses the `.dSYM` for that build. Xcode symbolicates automatically when the archive
  is still in your local Organizer; for a build archived elsewhere, or on CI, you need the `.dSYM`
  you kept. See [iOS Signing and Provisioning](../build-and-release/ios-signing.md).
- **Hangs** appear as a separate metric from crashes, and are the closest analogue to an ANR.
- If you enable bitcode-style recompilation or let the store process symbols, download the `.dSYM`
  that App Store Connect generated rather than assuming your local one matches.

:::

## Common patterns

### Breadcrumbs beat stack traces

A stack trace tells you where the app died. A breadcrumb trail tells you what the user did, which is
what you need to reproduce it. Record navigation events, significant taps and request outcomes —
never payloads.

```ts title=src/errors/breadcrumbs.ts
import 'react-native';

declare const reporter: {
  addBreadcrumb(message: string, data?: Record<string, string | number | boolean>): void;
};

/** Method, path, status and duration. No bodies, no headers, no query string. */
export function recordRequest(method: string, url: string, status: number, ms: number): void {
  reporter.addBreadcrumb('http', {
    method,
    path: url.split('?')[0],
    status,
    ms: Math.round(ms),
  });
}

export function recordScreen(name: string): void {
  reporter.addBreadcrumb('screen', {name});
}
```

### Report non-fatals from your boundaries

A caught render error is invisible to the store consoles and is exactly the class of bug that
degrades an app quietly. Report it from `componentDidCatch` with the boundary's name, so you can see
which region of the app is failing and for how many users.

### Attach a release identity you control

Set the reported release to the same string your build pipeline uses to name the source map. Matching
a report to a map should be a lookup, not an investigation.

### Do not report expected failures

A 401 that triggers a token refresh, a network timeout on a subway, a validation error — these are
normal and reporting them buries the real crashes in noise. Report the failures that indicate a bug.

### Watch the trend, not the count

The number that matters is crash-free sessions per release, compared with the previous release. An
absolute crash count goes up when your user base goes up.

### Alert on new groups, not on volume

The valuable alert is "a crash group that did not exist yesterday appeared in the release you shipped
two hours ago". Volume alerts fire during traffic peaks and get muted.

### Test the pipeline before you need it

Ship a debug-only screen with a button that throws, a button that rejects a promise, and — if your
SDK supports it — a button that triggers a native crash. Verify each arrives, symbolicated, in the
dashboard. Do this on every release pipeline change.

## Performance considerations

- **The SDK initialises on the startup path.** Measure startup with and without it; some reporters
  install native handlers and start a session before your first screen renders. See
  [Startup Time](../performance/startup-time.md).
- **Breadcrumbs cost memory and a little CPU per event.** Recording every render or every log line
  is a real cost. Record meaningful events.
- **Automatic console capture can be expensive** as well as leaky, because it serialises every
  argument of every call.
- **Reports are queued when offline** and sent later. That is correct behaviour, and it means a
  report's arrival time is not its occurrence time.
- **Sample non-fatals if volume is a problem.** Never sample fatals.

## Security considerations

**Threat.** A crash reporter is a pipeline that takes data off your users' devices and puts it on a
third party's servers, indexed and retained. Anything it captures automatically, it captures
whether you intended it or not.

**Exploit.** The realistic failure is not an attack, it is your own configuration. A reporter with
automatic `console` capture enabled, in an app that logs a response object on the error path, ships
access tokens and personal data to a vendor dashboard that your whole engineering team — and the
vendor's staff — can read. The same is true of automatic request/response body capture and of
setting the reporter's user identifier to an email address.

```bash
# The local half of the same problem, on a release build, while signed in.
adb logcat -d | grep -iE 'bearer |eyJ|refresh_token|"email"'
```

Anything that matches there is a candidate for what your reporter is also uploading.

**Fix.**

- **Turn off automatic console capture and automatic body capture.** Send breadcrumbs you wrote.
- **Redact before the SDK sees the data**, in your reporter seam, using the redaction described in
  [Safe Logging in Release Builds](../security/safe-logging.md).
- **Use an anonymous, app-generated user id**, not an email, phone number or account name. You can
  join it to a real identity on your own systems when you genuinely need to.
- **Treat source maps as source code.** Uploading them means the vendor holds your source; confirm
  that is acceptable to whoever owns that decision, and never publish them anywhere public — see
  [Source Maps](source-maps.md).
- **Know the retention period and the storage region**, and make sure your privacy policy matches
  what the SDK actually does.
- **Respect consent.** If your app requires consent for diagnostics, the SDK must not initialise
  before it is granted.

**Verification.** Trigger a test crash on a release build with a signed-in session, then open the
report and read every field. Look specifically at breadcrumbs, the user object, request data and any
"extra" or "context" section the SDK filled in by itself. If you find a token, an email address or a
request body, fix it before the next release — that data is already retained.

## Common mistakes

- **Only catching JavaScript errors.** Wrong: a global handler and nothing else. Right: native
  crashes are a separate mechanism and are a large share of real crashes.
- **Not uploading symbols.** Wrong: a dashboard full of bytecode offsets and stripped native frames.
  Right: source map, `mapping.txt` and `.dSYM`, uploaded by the same job that built the artifact.
- **Uploading symbols for the wrong build.** Wrong: one map per version name. Right: the identifiers
  in the report must match the artefact exactly; a rebuild shifts every offset.
- **Calling the SDK from everywhere.** Wrong: two hundred direct SDK calls. Right: one seam, so
  changing vendor is one file and redaction has one home.
- **Replacing the global handler without chaining.** Wrong: `ErrorUtils.setGlobalHandler(mine)`.
  Right: capture the previous handler and call it, or you lose LogBox and silence real crashes.
- **Leaving automatic console capture on.** Wrong: accepting the default. Right: it uploads
  everything you ever logged, including the things you did not mean to log.
- **Using an email address as the user identifier.** Wrong: convenient for support. Right: an
  anonymous id you can join server-side.
- **Reporting expected failures.** Wrong: every network timeout as an error. Right: report bugs; a
  dashboard nobody trusts is a dashboard nobody reads.
- **Trusting a vendor's compatibility claim.** Wrong: installing because the README says React
  Native. Right: `npm view <pkg> version peerDependencies`, and check the native side was ported to
  the New Architecture.
- **Ignoring the store consoles because you have an SDK.** Wrong: one source of truth. Right: the
  stores see crashes that happen before your SDK initialises, and Play Console is where ANRs live.
- **Testing the pipeline only once.** Wrong: verifying at integration time and never again. Right:
  a symbol upload silently breaking in CI is invisible until you need a report.

## Related topics

- [Error Boundaries](error-boundaries.md) — the non-fatal errors you have to report yourself.
- [Source Maps](source-maps.md) — the artefact that makes a JavaScript stack readable.
- [Reading a Release Stack Trace](release-stack-traces.md) — doing by hand what the service does for you.
- [Native Crash Logs](native-crash-logs.md) — the layer below JavaScript, and ANRs.
- [Console and Logs](console-and-logs.md) — what a reporter may be capturing without being asked.
- [Safe Logging in Release Builds](../security/safe-logging.md) — redacting before anything leaves the device.
- [ProGuard and R8](../build-and-release/proguard-and-r8.md) — the Android `mapping.txt`.
- [iOS Signing and Provisioning](../build-and-release/ios-signing.md) — keeping the `.dSYM`.
- [CI Pipelines](../build-and-release/ci-pipelines.md) — where symbol upload belongs.
- [Startup Time](../performance/startup-time.md) — measuring what the SDK costs at launch.
