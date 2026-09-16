---
title: Native Crash Logs
description: Reading the crash artefacts below JavaScript — logcat, tombstones and Play Console ANRs on Android, the device console, .ips reports and dSYM symbolication on iOS.
status: current
toolchain: cli
---

When the process dies, there is no JavaScript left to tell you about it. No error boundary runs, no
global handler fires, and nothing you wrote gets a chance to log. What you get instead is a native
crash artefact produced by the operating system, in a format that has nothing to do with React.

This page is about reading those artefacts. It is the most platform-specific page in this section,
because Android and iOS share nothing here — not the tools, not the file formats, not the
vocabulary.

## Why it exists / when to use it — and when NOT to

Reach for native crash logs when:

- The app **disappears** rather than showing an error. A JavaScript error in a release build ends up
  here too, but as a native crash with the JavaScript detail buried inside it.
- The crash happens **before JavaScript starts** — during native initialisation, or while loading
  the bundle.
- A **native module** is involved, yours or a dependency's.
- The app is **killed under memory pressure**, which is not an exception at all.
- The app **freezes** — an ANR on Android, a hang on iOS. Nothing crashed; the main thread stopped
  responding.

Do not start here for an ordinary JavaScript bug. A red box in development, or a symbolicated stack
from your crash reporter, is a far more direct route. Start here when the JavaScript tools show you
nothing because there was no JavaScript left to run.

## How a JavaScript crash looks from down here

Worth knowing before you read a report, because it saves you from investigating the wrong layer.

An unrecovered fatal JavaScript error in a release build is escalated into a native failure:

- **Android:** it surfaces as a `com.facebook.react.common.JavascriptException`. The JavaScript
  stack is inside the exception's message — readable, but unsymbolicated unless you apply your
  source map.
- **iOS:** React Native's fatal path (`RCTFatal` / `RCTFatalException`) raises an exception whose
  name identifies it as a React Native fatal, and the process terminates with `SIGABRT`.

So a crash report whose top frames are React Native runtime code, with a JavaScript-looking message,
is a **JavaScript bug reported by the native layer**. Symbolicate the JavaScript stack from the
message with your source map — see [Reading a Release Stack Trace](release-stack-traces.md) — rather
than digging through the native frames.

A crash whose frames are your native module, a third-party `.so`, or a system library is a genuine
native crash, and the rest of this page applies.

## Platform differences

Everything below is platform-specific. There is no shared tooling.

:::tabs
@tab Android

### The log, first

The crash buffer is separate from the main log and is the fastest first look:

```bash
# Crashes and fatal exceptions only.
adb logcat -b crash

# Since the last reboot, dumped and exited rather than followed.
adb logcat -b crash -d > crash.txt

# Everything from your process, which catches the lines leading up to it.
adb logcat --pid="$(adb shell pidof -s com.example.app)"
```

A native crash appears as a block from `libc` and `DEBUG`, starting with a line of asterisks and the
build fingerprint, then the signal, then the backtrace:

```text
F/libc    : Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0 in tid 12345
F/DEBUG   : *** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***
F/DEBUG   : Build fingerprint: '...'
F/DEBUG   : signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0
F/DEBUG   : backtrace:
F/DEBUG   :   #00 pc 00000000000a1b2c  /data/app/.../lib/arm64/libexample.so
```

The signal names the failure class:

| Signal | Usually means |
| --- | --- |
| `SIGSEGV` | Dereferenced an invalid pointer — a null or freed object in native code |
| `SIGABRT` | An assertion, an uncaught C++ exception, or a deliberate `abort()` |
| `SIGBUS` | Misaligned or invalid memory access |
| `SIGILL` | Executed an invalid instruction — often a corrupted or mismatched library |

A Java or Kotlin crash looks different: `E/AndroidRuntime: FATAL EXCEPTION: main` followed by a
normal JVM stack trace. That one is obfuscated in a release build and needs `mapping.txt` — see
[ProGuard and R8](../build-and-release/proguard-and-r8.md).

### Tombstones

For every native crash the platform writes a **tombstone**: the full register state, the memory map,
and the backtrace of every thread. It is far more detail than logcat carries.

```bash
# Debuggable builds and rooted devices can read the directory directly.
adb shell ls -l /data/tombstones/
adb shell cat /data/tombstones/tombstone_00 > tombstone_00.txt
```

On a production device with a release build you will not have permission for that path. The
supported route is a bug report, which packages tombstones, ANR traces and the logs together:

```bash
adb bugreport bugreport.zip
unzip -o bugreport.zip -d bugreport
# Tombstones and ANR traces are under FS/data/ inside the archive.
find bugreport -path '*tombstone*' -o -path '*anr*'
```

### Symbolicating a native backtrace

Raw frames are addresses inside a `.so`. `ndk-stack`, which ships with the NDK, turns them into
file and line numbers, given the **unstripped** libraries for that exact build:

```bash
# -sym points at the directory of UNSTRIPPED .so files for the ABI that crashed.
# Find it in your build output rather than copying a path from here — the exact
# intermediates layout is an Android Gradle Plugin detail and it changes:
#   find android/app/build -name "*.so" -path "*arm64-v8a*"
ndk-stack -sym <unstripped-lib-dir-for-arm64-v8a> -dump crash.txt
```

The catch is the same as every other symbolication story on this site: **you must keep the
unstripped libraries from the build you shipped.** They are deleted with the build directory, and a
rebuild produces different addresses. Archive them with the artifact, next to `mapping.txt` and the
source map.

For a single address, `llvm-symbolizer` from the NDK toolchain resolves it directly, which is
quicker when you only need one frame.

If you ship native code, upload the native debug symbols with the App Bundle so Play Console can
symbolicate for you. See [AAB and Play Store Submission](../build-and-release/play-store-submission.md).

### ANRs

An **Application Not Responding** is not a crash. The process is alive; the main thread has not
responded to input for several seconds, and the system offers the user the option to close the app.
Nothing in your JavaScript error handling sees it.

Causes in a React Native app cluster tightly:

- Work on the main (UI) thread inside a native module — file, database or network I/O in a
  synchronous TurboModule method.
- A synchronous JSI call that blocks the UI thread waiting on JavaScript while the JS thread is busy.
- A deadlock between the UI thread and a background thread in native code.
- A very long native operation during startup.

Note what is *not* on that list: a slow JavaScript render. That blocks the JS thread, not the main
thread, and produces jank rather than an ANR. See
[JS Thread vs UI Thread](../core-concepts/threading-model.md).

Where to read them:

- **Play Console → Quality → Android vitals → Crashes and ANRs.** This is the authoritative source,
  it is aggregated across real installs, and ANR rate is a metric the store holds you to.
- **A bug report** contains the ANR traces for a reproduction on your own device — the `anr`
  directory found by the `find` command above. The traces show every thread's stack at the moment
  the system gave up, and the main thread's stack is the answer.

@tab iOS

### The device console

The unified log is the live equivalent of logcat, and it shows the process dying even when it does
not produce a full crash report:

```bash
# Stream from an attached device.
log stream --device --predicate 'processImagePath CONTAINS "YourApp"'

# Capture a window of history into an archive you can analyse offline.
log collect --device --output yourapp.logarchive
log show --archive yourapp.logarchive --predicate 'eventMessage CONTAINS "YourApp"'
```

Console.app on macOS shows the same stream with a search field, and its **Crash Reports** section in
the sidebar lists reports from the attached device.

### Getting the `.ips` crash report

Modern iOS crash reports are `.ips` files — JSON, one summary line followed by a JSON body. Three
ways to get one:

1. **From the device:** Settings → Privacy & Security → Analytics & Improvements → Analytics Data.
   Scroll to entries named after your app. They can be shared from there.
2. **From Xcode, for an attached device:** Window → Devices and Simulators → select the device →
   **View Device Logs**. Xcode symbolicates automatically if it can find the matching `.dSYM`.
3. **From the store:** Xcode → Window → Organizer → **Crashes**, which shows reports from users who
   opted into sharing with developers. This is a sample, not a census.

Simulator crashes land in `~/Library/Logs/DiagnosticReports/` on your Mac.

### Reading the report

The fields that matter are near the top:

| Field | What it tells you |
| --- | --- |
| `Exception Type` | `EXC_BAD_ACCESS` — invalid memory access. `EXC_CRASH (SIGABRT)` — an uncaught exception or assertion. `EXC_RESOURCE` — a resource limit, commonly memory. |
| `Termination Reason` | The system's own explanation. `0x8badf00d` ("ate bad food") means the watchdog killed the app for taking too long. |
| `Triggered by Thread` | The thread whose backtrace you should read first. |
| `Thread N Crashed` | The backtrace itself. |
| `Binary Images` | The loaded images with their UUIDs and load addresses — the key to symbolication. |

A **watchdog termination** (`0x8badf00d`) is the iOS analogue of an ANR: your app took too long at
launch or on the main thread. A `JETSAM` or memory-related termination means the OS reclaimed your
memory; see [Memory](../performance/memory.md).

### Symbolicating with the `.dSYM`

A `.dSYM` bundle maps addresses back to functions and lines for one specific build. Match it by UUID
before trusting anything it tells you:

```bash
# The UUID(s) in your dSYM.
dwarfdump --uuid MyApp.app.dSYM

# Compare with the UUID for your binary in the crash report's Binary Images
# section. If they differ, this is the wrong dSYM and any output is fiction.
```

Then resolve a frame. `atos` takes the load address of the image from the report and the address
from the frame:

```bash
atos -o MyApp.app.dSYM/Contents/Resources/DWARF/MyApp \
     -arch arm64 \
     -l 0x104a18000 \
     0x104a5c3d4
```

`-l` is the image's load address from **Binary Images**; the final argument is the frame address.
Getting `-l` wrong produces plausible, wrong answers.

In practice you rarely do this by hand: dragging an `.ips` file onto Xcode's Organizer, or opening
it from Devices and Simulators, symbolicates it if the `.dSYM` is in Spotlight's index or in the
matching archive.

### Keeping the `.dSYM`

The `.dSYM` is produced by the archive build and is the only thing that makes a report readable.
Archive it per release, keyed by version, exactly as you archive the source map and `mapping.txt`.
If the store re-processed your binary, download the `.dSYM` that App Store Connect generated rather
than assuming your local copy matches. See
[iOS Signing and Provisioning](../build-and-release/ios-signing.md).

### Hangs

App Store Connect reports **hangs** as a separate metric from crashes: periods where the main thread
was unresponsive without the app dying. They are the closest analogue to an Android ANR, and they
have the same causes — main-thread I/O in a native module, a synchronous call waiting on a busy
thread, a long startup.

:::

## Common patterns

### Establish the layer before you investigate

Read the top frames of the crashing thread and answer one question: is this your native module, a
third-party native library, a system library, or the React Native runtime? Each has a different
owner and a different fix, and hours disappear into investigating the wrong one.

### Reproduce with a debug build attached

If you can reproduce a native crash at all, do it with the native debugger attached. A live debugger
gives you the state at the moment of the crash rather than a snapshot of the stack, which is the
difference between "the pointer was null" and "the pointer was null because this callback ran
twice". See [Debugging Native Code](../native-modules/debugging-native-code.md).

### Archive symbols as a build step

Three artefacts, one rule: keep them with the build, keyed by the same version identifiers the crash
report will carry.

| Platform | Artefact | Symbolicates |
| --- | --- | --- |
| Android | `mapping.txt` | Java and Kotlin frames |
| Android | unstripped `.so` files | Native frames |
| Both | composed source map | JavaScript frames |
| iOS | `.dSYM` | Native frames |

Any one of them missing makes one layer of every future crash report unreadable, and none of them
can be reconstructed after the fact. See [CI Pipelines](../build-and-release/ci-pipelines.md).

### Suspect memory before you suspect a bug

A crash with no obvious cause, clustered on older devices, on a screen with large images, is an
out-of-memory kill rather than a logic error. `EXC_RESOURCE` on iOS and a low-memory kill on Android
both look like the app simply vanishing. See [Memory](../performance/memory.md) and
[Image Performance and Caching](../performance/image-performance.md).

### Check the library before you debug it

A native crash inside a third-party library is frequently a known issue with a fixed version, or a
library that was never ported to the New Architecture. Check its issue tracker and its React Native
compatibility before spending a day in a disassembler. See
[Native Dependency Compatibility](../migration/native-dependency-compatibility.md).

## Common mistakes

- **Looking for a native crash in JavaScript tooling.** Wrong: expecting an error boundary or the
  global handler to catch a signal. Right: the process is gone before any JavaScript could run.
- **Investigating React Native's own frames.** Wrong: reading the runtime's stack when the message
  is a JavaScript error. Right: a `JavascriptException` on Android, or a React Native fatal on iOS,
  is a JavaScript bug — symbolicate the JavaScript stack instead.
- **Symbolicating with the wrong `.dSYM`.** Wrong: using whichever one is on disk. Right: compare
  `dwarfdump --uuid` with the report's Binary Images section first; a mismatched `.dSYM` produces
  confident nonsense.
- **Getting `atos -l` wrong.** Wrong: passing the frame address as the load address. Right: `-l` is
  the image's load address from the report.
- **Not keeping unstripped `.so` files.** Wrong: assuming `mapping.txt` covers native frames. Right:
  `mapping.txt` is Java and Kotlin only; native frames need the unstripped libraries or uploaded
  debug symbols.
- **Treating an ANR as a crash.** Wrong: looking for it in your crash reporter. Right: the app did
  not crash — Play Console's Android vitals, or iOS hang metrics, are where they live.
- **Blaming the JS thread for an ANR.** Wrong: optimising renders. Right: an ANR is the **main**
  thread; look for native work, synchronous module calls and deadlocks.
- **Expecting `/data/tombstones` to be readable.** Wrong: `adb shell cat` on a production device.
  Right: `adb bugreport`, and read the tombstones inside the archive.
- **Assuming Organizer crashes are a census.** Wrong: reading a low count as a low crash rate.
  Right: iOS reports come only from users who opted in.
- **Ignoring the `Termination Reason`.** Wrong: reading the backtrace of a watchdog kill as if it
  were the bug. Right: `0x8badf00d` means "too slow", and the backtrace is just where the timer
  expired.

## Related topics

- [Crash Reporting](crash-reporting.md) — collecting these artefacts from devices you do not own.
- [Reading a Release Stack Trace](release-stack-traces.md) — the JavaScript half of a crash report.
- [Source Maps](source-maps.md) — the artefact that makes the JavaScript stack readable.
- [Error Boundaries](error-boundaries.md) — why nothing in JavaScript catches a native crash.
- [Console and Logs](console-and-logs.md) — the log surrounding the crash.
- [Debugging Native Code](../native-modules/debugging-native-code.md) — attaching a native debugger.
- [ProGuard and R8](../build-and-release/proguard-and-r8.md) — `mapping.txt` and retracing Java frames.
- [iOS Signing and Provisioning](../build-and-release/ios-signing.md) — where the `.dSYM` comes from.
- [JS Thread vs UI Thread](../core-concepts/threading-model.md) — which thread an ANR is about.
- [Memory](../performance/memory.md) — crashes that are really out-of-memory kills.
