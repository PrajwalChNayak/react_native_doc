---
title: Debugging Native Code
description: Attaching Android Studio and Xcode to a running React Native app, reading native logs and crashes, and using Codegen output to diagnose a spec mismatch.
status: current
toolchain: cli
---

React Native DevTools debugs JavaScript. The moment a problem lives in Kotlin, Swift,
Objective-C++ or the generated C++ between them, DevTools shows you a call into a module and
nothing after it. This page is about the other side of that call.

The tools are the platforms' own: Android Studio's debugger and `logcat` on one side, Xcode and
LLDB on the other. Nothing here is React-Native-specific except *where to attach* and *which
generated file to read*.

## Deciding which layer is actually broken

Before attaching anything, work out which side of the boundary the failure is on. The symptom
usually tells you.

| Symptom | Layer | Where to look first |
| --- | --- | --- |
| `TurboModuleRegistry.getEnforcing(...): 'X' could not be found.` | Registration / linking | Autolinking config, `PackageList.java`, `pod install` |
| The call returns, but the value is wrong or `undefined` | Your native implementation | A breakpoint in the Kotlin or Swift method |
| The call throws a type error inside the generated code | Spec mismatch | The generated spec header or `*Spec.java` |
| The app crashes with no JavaScript stack | Native crash | `logcat` / the iOS crash report, then a native debugger |
| It works in debug and fails in release | Shrinking, or a bundled-asset difference | R8 keep rules, release-only build settings |
| It works on one platform only | One half was never linked or never written | `npx @react-native-community/cli config` |

That first row is the most common of all, and it is worth reading literally: the message says the
module is not registered *in the native binary*. That is a linking problem, not a code problem, and
no amount of stepping through your Kotlin will show it to you. Start at
[Autolinking](autolinking.md).

## Native logs, from the terminal

The CLI ships two log commands. They are convenience wrappers, and knowing exactly what they wrap
is the difference between using them and being confused by them.

```bash
# Android: streams logcat, filtered to the ReactNative and ReactNativeJS tags.
npx react-native log-android

# iOS (macOS only): tails the simulator's syslog.
npx react-native log-ios

# iOS: choose which simulator to tail rather than taking the first booted one.
npx react-native log-ios -i
```

`log-android` takes **no options at all** in `@react-native-community/cli` 20.2.0 — verified by
reading the command definition in the published package. It filters to two tags, which means your
own `Log.d("Calendar", ...)` output does not appear. For anything beyond React Native's own
messages, use `adb` directly:

```bash
# Everything from your app's process, unfiltered.
adb logcat --pid=$(adb shell pidof -s com.awesomeproject)

# One tag, warnings and above, everything else silenced.
adb logcat CalendarModule:W '*:S'

# Clear the buffer first so you are reading this run, not the last one.
adb logcat -c && adb logcat --pid=$(adb shell pidof -s com.awesomeproject)
```

`log-ios` has exactly one option, `-i` / `--interactive`, for picking the simulator. For a physical
device, or for structured filtering, use the platform tool:

```bash
# macOS only. Stream the simulator's log for one subsystem or process.
xcrun simctl spawn booted log stream --predicate 'process == "AwesomeProject"'
```

## Attaching a debugger

:::tabs
@tab Android
Everything in this tab works from any host OS — Windows, Linux or macOS.

**Open the right folder.** In Android Studio, open `AwesomeProject/android`, not the repository
root. Opening the root gives you a folder with no Gradle project in it, and the debugger has
nothing to attach to.

**Attach to the running process.** You do not have to launch from Android Studio. Run the app the
way you normally do, then use **Run → Attach Debugger to Android Process** and pick your
application id.

The dialog asks which debugger to use, and the choice matters:

| Debugger type | Use it for |
| --- | --- |
| Java/Kotlin | Your `ReactPackage`, your module class, anything you wrote in Kotlin |
| Native | C++ TurboModules, Fabric component C++, JSI code |
| Dual (Java + Native) | A call that crosses from Kotlin into C++ and back |

Dual is slower to attach and slower to step. Reach for it only when the bug is genuinely on the
boundary.

**Set breakpoints where the generated code calls you.** The useful breakpoint is rarely at the top
of your method — it is on the line that reads an argument out of a `ReadableMap`, or the line that
resolves a `Promise`. Stepping from there shows you the values Codegen actually delivered.

**Build with the debug symbols you need.** For native (C++) debugging, build a variant that has not
been stripped. The React Native Gradle plugin builds debug variants with symbols; a release build
strips them, which is why "attach and step" silently does nothing against a release APK.

**Useful Gradle invocations while debugging a build rather than a run:**

```bash
cd android

# Why did this task run, and with what inputs.
./gradlew :app:assembleDebug --info

# The full stack trace for a Gradle failure, not the one-line summary.
./gradlew :app:assembleDebug --stacktrace

# Which ReactPackages were actually registered.
./gradlew :app:generateAutolinkingPackageList
cat app/build/generated/autolinking/src/main/java/com/facebook/react/PackageList.java
```

**Native crashes.** A crash in C++ or in the JNI layer produces a tombstone in `logcat` with a
backtrace of addresses. Symbolicate it with `ndk-stack`:

```bash
adb logcat | ndk-stack -sym android/app/build/intermediates/merged_native_libs/debug/out/lib/arm64-v8a
```

The exact intermediates path varies by AGP version, so list the directory rather than trusting the
path above verbatim.
@tab iOS
> [!WARNING] This tab requires macOS
> Xcode, LLDB against a device or simulator, and the iOS crash-report tooling are macOS-only.
> There is no supported way to debug the iOS half of a React Native app from Windows or Linux. If
> you are on another host OS, the honest options are a Mac, a hosted macOS CI runner, or leaving
> the iOS half to someone who has one.

**Open the workspace.** `ios/AwesomeProject.xcworkspace`, never `ios/AwesomeProject.xcodeproj`.
With CocoaPods in play, the project alone does not include the pods and will not build.

**Attach to a running app.** Run the app however you like, then **Debug → Attach to Process** and
pick it. Xcode can also wait for the next launch: **Debug → Attach to Process by PID or Name**,
type the process name, and it attaches as soon as the app starts — which is how you catch a crash
that happens during startup.

**Breakpoints that pay for themselves:**

| Breakpoint | Why |
| --- | --- |
| Line breakpoint in your `.mm` `getTurboModule:` | Proves the module was constructed at all |
| All Exceptions breakpoint | Stops at the throw, not at the top-level handler, so you see the real frame |
| Symbolic breakpoint on `objc_exception_throw` | Catches an unrecognised selector, which is the classic "spec says one thing, implementation says another" failure |

Add an exception breakpoint from the Breakpoint navigator: **+ → Exception Breakpoint**. Without
it, an Objective-C exception surfaces far away from its cause and the stack is useless.

**LLDB commands worth memorising.** In the console at a breakpoint:

```text
po self                 print an Objective-C / Swift object's description
p someInt               print a value with its type
bt                      backtrace for the current thread
thread backtrace all    every thread, which is how you see the JS thread and the UI thread at once
frame variable          all locals in the current frame
image list -b MyLib     confirm a library was actually loaded into the process
```

`thread backtrace all` is the one people skip. React Native runs JavaScript on its own thread, and a
deadlock or a main-thread block is visible only when you look at every thread together — see
[JS Thread vs UI Thread](../core-concepts/threading-model.md).

**Native crash reports.** A crash on a device lands in **Window → Devices and Simulators → View
Device Logs**. Xcode symbolicates it automatically when the matching dSYM is present. If the frames
are hex addresses, the dSYM for that exact build is missing — keep the archive, not just the IPA.

**Build-level debugging.** When the failure is in the build rather than at runtime:

```bash
cd ios

# What CocoaPods actually resolved, and from where.
bundle exec pod install --verbose

# Rebuild the pod tree from scratch after a dependency change.
rm -rf Pods Podfile.lock && bundle exec pod install
```
:::

## Reading Codegen output when a spec mismatch bites

A spec mismatch is the failure mode unique to this stack: your TypeScript spec and your native
implementation disagree, the app compiles, and the call fails at runtime in a way neither side
explains. The generated code is the arbiter — it is the authoritative statement of what you were
supposed to implement.

### Where to look

:::tabs
@tab Android
```text
android/app/build/generated/source/codegen/
├── schema.json                                  what Codegen understood your spec to mean
├── java/<javaPackageName>/NativeCalendarSpec.java   the abstract class you must extend
└── jni/                                         the C++ half
```

`NativeCalendarSpec.java` is the file to read. It has one abstract method per spec method, with the
exact Java types Codegen chose. If your Kotlin method takes `Int` where the generated signature says
`double`, your class does not override the abstract method — it adds a new one — and the runtime
calls the abstract one.
@tab iOS
```text
ios/build/generated/ios/
└── RNCalendarSpec/
    ├── RNCalendarSpec.h        @protocol NativeCalendarSpec, plus the JSI class
    └── RNCalendarSpec-generated.mm
```

The `@protocol` is the file to read. Objective-C lets a class claim a protocol without implementing
every method — it is a warning, not an error — so a renamed or mistyped selector compiles and then
fails at call time as an unrecognised selector.

Turning on "Treat incomplete protocol conformance as error" in the target's build settings converts
that warning into a build failure, which matches Android's behaviour.
:::

### Regenerating deliberately

```bash
# Both platforms, into the default location.
npx react-native codegen

# One platform, an explicit output path, from a library rather than an app.
npx react-native codegen --platform ios --outputPath ./build/generated --source library
```

```bash
# Android only: the Gradle task, which is what the build itself runs.
cd android && ./gradlew generateCodegenArtifactsFromSchema
```

Read `schema.json` first when a type is behaving oddly. It is the intermediate representation, and
it shows you what Codegen understood — which is not always what you thought you wrote. The spec
type rules are in [Codegen and Spec Files](codegen-specs.md).

### The three mismatches that actually happen

| What you did | What happens | How you see it |
| --- | --- | --- |
| Renamed a spec method but not the implementation | Android: the abstract method is never overridden. iOS: unrecognised selector | Compare your method name against the generated signature |
| Used `number` in the spec and `Int` in Kotlin | The override does not match; the abstract method is called | The generated `*Spec.java` says `double` |
| Changed the string passed to `getEnforcing` | The module is never found, even though it is registered | `getEnforcing` throws with the name you passed |

> [!WARNING] Never edit generated code to make a mismatch go away
> Everything under `build/generated/` is rewritten on the next build. An edit there produces a fix
> that works on your machine until you clean, and never works for anyone else. Change the spec or
> change the implementation.

## Proving a module is linked at all

Before any of the above, establish whether the native half exists in the binary. Three checks, from
cheapest to most conclusive.

```bash
# 1. Does the CLI consider the library linkable at all?
npx @react-native-community/cli config

# 2. Android: is the package in the generated list?
cd android && ./gradlew generateAutolinkingPackageList
cat app/build/generated/autolinking/src/main/java/com/facebook/react/PackageList.java
```

```ts
// 3. From JavaScript: `get` returns null instead of throwing, so this
// distinguishes "not linked" from "linked but broken" without a crash.
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule} from 'react-native';

interface Spec extends TurboModule {
  createEvent(title: string): Promise<string>;
}

export function isCalendarLinked(): boolean {
  return TurboModuleRegistry.get<Spec>('NativeCalendar') != null;
}
```

On iOS, a `null` here after a fresh `npm install` almost always means `pod install` was not run.
That asymmetry — Android autolinks on every build, iOS autolinks at install time — is the single
most common reason a module "works on Android only".

## Platform differences

| | Android | iOS |
| --- | --- | --- |
| Host OS needed | Any | **macOS only** |
| IDE | Android Studio, opened at `android/` | Xcode, opened at `ios/*.xcworkspace` |
| Attach | Run → Attach Debugger to Android Process | Debug → Attach to Process |
| Native debugger | LLDB via the Native/Dual debugger type | LLDB, always |
| Logs | `adb logcat`, `npx react-native log-android` | `log stream`, `npx react-native log-ios` |
| Crash symbols | `ndk-stack` with the unstripped `.so` | dSYM from the archive |
| Missing-module cause | Rare; autolinking runs every build | Usually a skipped `pod install` |
| Incomplete implementation | Compile error — the abstract method is unimplemented | Warning only, unless you make it an error |

That last row is the important asymmetry for native module authors. Android's generated spec is an
abstract class, so forgetting a method does not compile. iOS's is a protocol, so forgetting a method
compiles and crashes later.

## Common patterns

**Reproduce in a debug build before you reach for the debugger.** A bug that only appears in release
is a shrinking, signing or bundled-asset bug, and no breakpoint will find it. Start at
[ProGuard and R8](../build-and-release/proguard-and-r8.md).

**Log at the boundary, on both sides, once.** One log line in the JavaScript wrapper and one at the
top of the native method answers "did the call arrive" in thirty seconds, which is the question you
actually have most of the time.

**Keep the native project open while you work on native code.** The edit-build-run loop for Kotlin
or Swift is a native loop; Fast Refresh does nothing for it. Building from the IDE is faster than
`npm run android` because it skips the parts that have not changed.

**Clear the log buffer before reproducing.** `adb logcat -c` first. Reading an old crash from the
previous run and debugging it for twenty minutes is a rite of passage nobody needs twice.

## Common mistakes

- **Debugging Kotlin with React Native DevTools.** Wrong: expecting a JavaScript debugger to step
  into a TurboModule. Right: Android Studio or Xcode. DevTools sees the call leave and nothing
  after it.
- **Opening the repository root in Android Studio.** Wrong: no Gradle project, no debugger. Right:
  open `android/`.
- **Opening the `.xcodeproj` instead of the `.xcworkspace`.** The pods are not in the project, so the
  build fails with missing headers before you get anywhere near a breakpoint.
- **Attaching the Java debugger to a C++ crash.** Wrong: breakpoints that never hit. Right: the
  Native or Dual debugger type, and a build that has not been stripped.
- **Expecting `npx react-native log-android` to show your own tag.** It filters to `ReactNative` and
  `ReactNativeJS` only. Use `adb logcat` with your tag.
- **Treating `getEnforcing` failing as a bug in your native code.** It is a registration failure.
  Your code was never loaded, so nothing in it can be wrong yet.
- **Editing a file under `build/generated/`.** It is rewritten on the next build. Fix the spec or the
  implementation.
- **Assuming an iOS protocol conformance is checked.** Objective-C warns and continues. Turn
  "Treat incomplete protocol conformance as error" on, or find out at runtime.
- **Debugging a release crash without the dSYM or the unstripped `.so`.** The backtrace is hex
  addresses. Archive the symbols with every release build — see
  [Reading a Release Stack Trace](../debugging/release-stack-traces.md).
- **Forgetting `pod install` and then reading Kotlin.** If the module is missing on iOS only, the
  bug is an install step, not your code.

## Related topics

- [TurboModules End to End](turbomodules-end-to-end.md) — the path a call takes, which is what you are stepping through.
- [Codegen and Spec Files](codegen-specs.md) — what the generated files mean and how to read `schema.json`.
- [Autolinking and react-native.config.js](autolinking.md) — the usual cause of a module that is not found.
- [Writing a Module in Kotlin](writing-a-module-in-kotlin.md) — the Android implementation and its threading rules.
- [Writing a Module in Swift](writing-a-module-in-swift.md) — the Objective-C++ layer and the protocol trap.
- [Platform Folders](platform-folders.md) — which project to open, and what is build output.
- [React Native DevTools](../debugging/react-native-devtools.md) — the JavaScript half of debugging.
- [JS Thread vs UI Thread](../core-concepts/threading-model.md) — why `thread backtrace all` matters.
- [Native Crash Logs](../debugging/native-crash-logs.md) — symbolicating a crash from the field.
- [ProGuard and R8](../build-and-release/proguard-and-r8.md) — when the bug only exists in release.
- [Troubleshooting](../reference/troubleshooting.md) — the shorter, symptom-first version of this page.
