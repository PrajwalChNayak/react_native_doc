---
title: Reading a Release Stack Trace
description: What a Hermes release trace actually looks like, why it is full of bytecode offsets rather than minified names, and the exact commands that turn it back into your source.
status: current
toolchain: cli
---

A stack trace from a release build looks like nothing you wrote. It names functions you half
recognise and points them at a single line of a file called `index.android.bundle`, with a number
in the hundreds of thousands where a column should be.

That number is not a column. Understanding what it actually is turns symbolication from a ritual
into a two-command procedure — and tells you immediately when the trace cannot be symbolicated at
all, so you stop trying.

## Why it exists / when to use it — and when NOT to

You are reading a release trace because there is no debugger to attach. It arrived from a crash
reporter, a store console, a tester's screenshot, or your own release build on your own desk.

Do not do this by hand when your crash reporter already symbolicates for you — that is what you
uploaded the source map for. Do it by hand when:

- The reporter failed to symbolicate and you need to know why.
- The trace came from somewhere with no reporter — a QA bug report, a support ticket.
- You are verifying that your source map pipeline actually works, before you need it.
- You want to check one frame rather than read a whole dashboard.

## What a release trace looks like

React Native parses Hermes stacks with a known grammar, so the shapes below are exact rather than
approximate. A frame is one of three things:

```text
Error: Cannot read property 'id' of undefined
    at handleSubmit (address at /data/user/0/com.example.app/files/index.android.bundle:1:427231)
    at anonymous (address at /data/user/0/com.example.app/files/index.android.bundle:1:401882)
    at apply (native)
    ... skipping 4 frames
    at global (address at unknown:1:9)
```

| Frame shape | Meaning |
| --- | --- |
| `at <fn> (address at <file>:<line>:<offset>)` | A **bytecode** frame. `<line>` is 1-based; the last number is a **0-based virtual offset into the bytecode**, not a column. |
| `at <fn> (<file>:<line>:<column>)` | A **source** frame — the bundle still had a source location. `<column>` is 1-based here. |
| `at <fn> (native)` | A frame inside the engine or a host function. Nothing to symbolicate. |
| `... skipping N frames` | Hermes truncated the middle of a deep stack. |

Two frames you can ignore on sight: anything in `InternalBytecode.js` is Hermes' own internal
code, and `(native)` frames have no JavaScript source at all.

### Why "address at" and not minified names

This is where web intuition misleads.

React Native's release builds **do not minify the JavaScript**. Both platform build scripts disable
it when Hermes is enabled — there is no point mangling identifiers in source that is about to be
compiled to bytecode and thrown away. So a release trace does not contain `a.b.c is not a function`
with single-letter names.

What you get instead is bytecode. `hermesc` compiles the bundle ahead of time, with no JIT, so a
frame is a position in a bytecode function rather than a position in a text file. The function name
often survives — `handleSubmit` above is real — but the location is an offset.

The consequence for symbolication: you need a map from **bytecode offset** back to your source, and
that is the composed map, not the bundler's map alone. See [Source Maps](source-maps.md) and
[Hermes and Bytecode](../performance/hermes-and-bytecode.md).

## Basic example — symbolicate a whole trace

The tool is `metro-symbolicate`, which ships as part of Metro and is therefore already in your
project's `node_modules`.

Save the trace to a file exactly as you received it, then pipe it in:

```bash
npx metro-symbolicate build/index.android.bundle.map < crash.txt
```

It reads the trace from standard input, rewrites every position it can resolve, and prints the
result. Positions it cannot resolve come back as `null`, which is information: it means the map does
not cover that frame.

For a single frame, pass the position directly instead of piping a file:

```bash
# <map> <line> <column-or-offset>
npx metro-symbolicate build/index.android.bundle.map 1 427231
```

That prints `source:line:name` — for the frame above, something like
`src/screens/CheckoutScreen.tsx:84:handleSubmit`.

The defaults line up with Hermes without any flags: `metro-symbolicate` expects 1-based input lines
and 0-based input columns, which is exactly how a bytecode frame is written.

## How it works

### The full procedure

1. **Identify the build.** Take the version identifiers from the crash report —
   `versionName` / `versionCode` on Android, `CFBundleShortVersionString` / `CFBundleVersion` on
   iOS. Everything else depends on getting this right.

2. **Fetch the matching composed source map.** From wherever your pipeline archived it. Not a map
   from a similar build, not a rebuild of the same commit — the map produced by that artifact.

   ```bash
   # Android, from a local build:
   ls android/app/build/generated/sourcemaps/react/release/index.android.bundle.map
   # iOS: whatever path SOURCEMAP_FILE pointed at in the bundle build phase.
   ```

3. **Save the trace verbatim**, including the leading four spaces on each frame line. The parser
   depends on that indentation.

   ```bash
   cat > crash.txt <<'EOF'
   Error: Cannot read property 'id' of undefined
       at handleSubmit (address at index.android.bundle:1:427231)
   EOF
   ```

4. **Symbolicate.**

   ```bash
   npx metro-symbolicate index.android.bundle.map < crash.txt
   ```

5. **Read the result against the commit that produced the build**, not against `main`. Line numbers
   are only meaningful in the source that was compiled.

### Verifying the map before you trust the output

A wrong map does not fail loudly — it resolves to real-looking, wrong positions. One check costs a
few seconds: pick a frame whose function name you can see in the trace, symbolicate it alone, and
confirm the file that comes back is one that plausibly contains that function.

```bash
npx metro-symbolicate index.android.bundle.map 1 427231
```

If that returns `null:null:null`, the offset is outside the map, which usually means the map belongs
to a different build. If it returns a file you do not recognise, the map is probably the packager
map alone rather than the composed map — see the composition step in [Source Maps](source-maps.md).

### Other input formats `metro-symbolicate` accepts

Its own usage text lists these, and they are worth knowing because they cover the cases where you
have something other than a plain text trace:

| Input | Invocation |
| --- | --- |
| A plain text stack trace | `metro-symbolicate <map> < trace.txt` |
| A single position | `metro-symbolicate <map> <line> [column]` |
| A position inside one module | `metro-symbolicate <map> <moduleId>.js <line> [column]` |
| A Hermes crash-dump JSON | `metro-symbolicate <map> --hermes-crash < crash.json` |
| A profiler map | `metro-symbolicate <map> <file>.profmap` |
| A CPU profile | `metro-symbolicate <map> <file>.cpuprofile` |

`--hermes-crash` is the one to reach for when you have Hermes' own crash JSON — a structured object
with a `callstack` array — rather than the text rendering of a stack. It reads JSON from standard
input and writes symbolicated JSON out.

Useful flags:

| Flag | Use |
| --- | --- |
| `--no-function-names` | Resolve to identifier names rather than inferred function names |
| `--input-line-start` / `--input-column-start` | When your trace is not 1-based lines and 0-based columns |
| `--output-line-start` / `--output-column-start` | Shift the numbering of the output |

> [!NOTE] There is no `react-native symbolicate` command in 0.87
> The bundler-related commands the CLI registers are `bundle` and `start`. Symbolication is
> `metro-symbolicate`, and during development the dev server's `POST /symbolicate` endpoint. If you
> find a tutorial invoking a `symbolicate` subcommand, it is out of date or describing a different
> toolchain.

### When the trace is inside a native crash report

An unrecovered JavaScript error in a release build becomes a native crash, and the JavaScript stack
is carried in the exception message. Extract that message, save it as a text file preserving the
indentation, and run it through the procedure above. The native frames around it belong to the React
Native runtime and are not where the bug is. See [Native Crash Logs](native-crash-logs.md).

### When you do not have the map

Be honest with yourself early, because this is not recoverable:

- **A map from a rebuild of the same commit will not work.** Bytecode offsets shift with any change
  in the toolchain, the dependency tree, or the build environment. Same source is not the same
  build.
- **The bundle alone is not enough.** You can extract `index.android.bundle` from the APK, but it is
  compiled bytecode; there is no map hiding in it.
- **Function names are the only thing left.** A release trace usually retains function names even
  without a map, which is often enough to locate the code by grep. It will not give you a line
  number.

Then fix the pipeline so the next one is readable: archive the composed map with every build, keyed
by the version identifiers the crash report carries. See [Source Maps](source-maps.md) and
[CI Pipelines](../build-and-release/ci-pipelines.md).

## Platform differences

The JavaScript half of the procedure is identical: same bytecode format, same map format, same tool.
What differs is where the map comes from and what surrounds the trace.

:::tabs
@tab Android

The composed map is produced by the Gradle bundle task without any extra configuration, at
`android/app/build/generated/sourcemaps/react/<variant>/index.android.bundle.map`.

A JavaScript crash reaches the platform as a `com.facebook.react.common.JavascriptException`, so in
`adb logcat -b crash` or in Play Console the JavaScript stack appears inside a Java exception
message. Copy it out from there.

Java and Kotlin frames in the same report are a different problem with a different tool — `mapping.txt`
and `retrace`. See [ProGuard and R8](../build-and-release/proguard-and-r8.md).

@tab iOS

**No map is produced unless `SOURCEMAP_FILE` is set** in the Bundle React Native code and images
build phase. If you did not set it before the build, there is no map and the trace cannot be
symbolicated. This is the single most common cause of an unreadable iOS release trace.

With it set, the file at that path is already the composed map — the build script runs
`compose-source-maps.js` for you and deletes the intermediates.

A JavaScript fatal terminates the process through React Native's fatal path, producing a crash
report with `SIGABRT`; the JavaScript stack is in the exception's description. Native frames in the
same report need the `.dSYM` instead — see
[iOS Signing and Provisioning](../build-and-release/ios-signing.md).

:::

## Common patterns

### Symbolicate on the commit, not on the branch

Check out the commit the build came from before you read the output. A line number that resolves to
`CheckoutScreen.tsx:84` means line 84 of that file *as it was built*, and a month of changes makes
that a different line.

### Keep a `symbolicate` script in the repository

Turn the procedure into one command so nobody has to remember the argument order at the moment they
are least able to:

```bash
# scripts/symbolicate.sh <map> <trace-file>
#!/usr/bin/env bash
set -euo pipefail
npx metro-symbolicate "$1" < "$2"
```

### Test the pipeline on purpose, once per release process change

Add a debug-only button that throws, build Release, crash it, and symbolicate the result end to end.
Finding out that `SOURCEMAP_FILE` was never set, or that CI stopped archiving maps, should happen on
a day you chose rather than during an incident.

### Grep by function name when the map is gone

A release trace usually keeps function names. `grep -rn "handleSubmit" src/` will not give you a line
number but frequently gives you the file, and that is enough to make progress while you fix the
archiving.

### Read the whole stack, not the top frame

The top frame is where the error was thrown, which is often a shared helper. The frame that tells
you what to fix is usually two or three down, where your screen code called it.

## Performance considerations

- **Symbolication is not free on large maps.** A composed map for a real app is tens of megabytes;
  loading it takes seconds. Symbolicate a batch of traces in one invocation rather than shelling out
  per frame.
- **A directory of maps can be passed** in place of a single map file, for resolving frames across
  several bundles. That path is marked unstable in Metro's own source, so treat it as convenience
  rather than as something to build a pipeline on.
- **Do not generate maps only on demand.** There is no "on demand" — the map has to be produced by
  the same build as the artifact, so the cost belongs in every release build. Metro 0.87 halved the
  memory that costs.

## Security considerations

**Threat.** A symbolicated trace contains your source file paths, function names and line numbers.
The source map that produced it may contain the source itself.

**Exploit.** Pasting a symbolicated stack into a public issue tracker, a vendor support ticket or a
screenshot in a chat channel discloses your internal structure. Publishing the map is worse — it is
your codebase.

**Fix.** Symbolicate locally or inside your own infrastructure. Share the minimum: the error message
and the frames that matter, not the whole trace, and never the map. Keep maps in a private artifact
store with access limited to the people who read crash reports.

**Verification.** Confirm no map is reachable from anywhere public, and that none ships inside the
app:

```bash
unzip -l app-release.apk | grep -i "\.map"
```

Empty output is the expected result. The full argument and the vendor-upload question are in
[Source Maps](source-maps.md).

## Common mistakes

- **Reading the offset as a column.** Wrong: looking for column 427231 in a 90-line file. Right: it
  is a 0-based virtual offset into the bytecode.
- **Expecting minified identifiers.** Wrong: assuming web-style mangled names. Right: Hermes builds
  are not minified — function names usually survive, positions do not.
- **Using the packager map instead of the composed map.** Wrong: symbolicating bytecode offsets with
  the bundler's own map. Right: compose the packager and compiler maps first.
- **Using a map from a different build.** Wrong: rebuilding the same commit to get a map. Right:
  offsets shift; only the map produced by that exact build resolves correctly.
- **Trusting output without checking it.** Wrong: accepting a resolved position because it looks
  like a file. Right: a mismatched map resolves to plausible, wrong places — verify one known frame
  first.
- **Stripping the indentation from the trace.** Wrong: reformatting before saving. Right: the parser
  matches four leading spaces on each frame line.
- **Chasing `(native)` and `InternalBytecode.js` frames.** Wrong: investigating engine internals.
  Right: they have no JavaScript source; skip them.
- **Forgetting `SOURCEMAP_FILE` on iOS.** Wrong: discovering it when the first crash arrives. Right:
  no variable, no map, no symbolication — verify it once and test it.
- **Looking up a line number against the current branch.** Wrong: `CheckoutScreen.tsx:84` on `main`.
  Right: check out the commit that was built.
- **Looking for a `react-native symbolicate` command.** Wrong: following an old tutorial. Right:
  `metro-symbolicate`, or the dev server's endpoint during development.

## Related topics

- [Source Maps](source-maps.md) — producing and archiving the map this page consumes.
- [Crash Reporting](crash-reporting.md) — having a service do this for you, at scale.
- [Native Crash Logs](native-crash-logs.md) — the native report a JavaScript trace arrives inside.
- [Error Boundaries](error-boundaries.md) — catching the error before it becomes a release trace.
- [Console and Logs](console-and-logs.md) — where an unsymbolicated trace shows up first.
- [Hermes and Bytecode](../performance/hermes-and-bytecode.md) — why the trace has offsets in it.
- [Hermes](../core-concepts/hermes.md) — the engine and its ahead-of-time compilation.
- [ProGuard and R8](../build-and-release/proguard-and-r8.md) — the Java and Kotlin equivalent.
- [CI Pipelines](../build-and-release/ci-pipelines.md) — archiving maps so this is possible at all.
