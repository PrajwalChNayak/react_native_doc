---
title: The Profiler and React Native DevTools
description: The recording workflow — JavaScript flame charts, React commits, heap snapshots and platform traces — and how to read what each one gives you.
status: current
toolchain: cli
---

This is the practical companion to [Measuring Before Optimising](measuring-first.md): not which
tools exist, but how to drive them and what the output actually means. Four recordings answer four
different questions, and picking the wrong one is how an afternoon disappears.

[React Native DevTools](../debugging/react-native-devtools.md) covers the tool itself — opening it,
connecting, and the panels that are not about performance.

## Why it exists — what each recording answers

| Question | Recording |
| --- | --- |
| Where is JS-thread time going? | **Performance** panel — a sampled flame chart |
| Which components re-render, how often, and why? | **Profiler ⚛** panel — React's own commit data |
| What is retaining memory? | **Memory** panel — two heap snapshots, compared |
| The JS thread is idle and the UI still stutters | Platform trace — Perfetto or Instruments |

If you cannot say which of those four you are asking, stop and work that out first. Each recording
is cheap; interpreting the wrong one is not.

## Basic example — a recording worth reading

Every useful recording has the same shape.

1. **Build Release.** A debug build compiles JavaScript at load and keeps development assertions.
2. **Reproduce the problem manually once**, so you know exactly what to do.
3. **Open DevTools** — press <kbd>j</kbd> in the Metro terminal, or use the Dev Menu.
4. **Start recording, perform the one interaction, stop.** Not thirty seconds of everything.
5. **Read the widest bar, not the tallest stack.**

Step 4 is where most recordings go wrong. A profile of "using the app" contains your problem and
forty other things, and the forty other things are easier to see.

## How it works

### The Performance panel

This is a **sampling** profiler: it interrupts the JavaScript thread at intervals and records the
stack. It does not instrument every function call, which is why the overhead is tolerable and why
very short functions can be invisible.

Reading a flame chart:

- **Width is time.** Depth is only call nesting — a deep stack is not a slow one.
- **Self time** is time in that function's own body. **Total time** includes everything it called.
  A wide frame with tiny self time is a dispatcher; look at its children.
- **Repeated identical stacks** across a recording mean something ran many times, which is usually a
  render loop rather than one slow function.

`Systrace` markers you added in your own code show up as named regions, which is the fastest way to
confirm that the wide frame is the code you think it is.

> [!NOTE] Absolute numbers run high
> Profiling adds overhead. Use the recording to find the *shape* — which function dominates — and
> confirm the improvement with a timing taken outside the profiler.

### The React Profiler

The **Profiler ⚛** panel records React's own work: every commit, every component that rendered in
it, and how long each took. This is the tool for re-render questions, and nothing else answers them.

Turn on **"Record why each component rendered while profiling"** in the panel's settings before you
record. Without it you get durations; with it, each component tells you whether it re-rendered
because of props, state, a hook, or its parent — which is exactly the information a memoization
decision needs. It costs recording overhead, which is why it is off by default.

How to read it:

1. **Commit count first.** Twenty commits for one tap is an update-loop problem. One 200 ms commit
   is a render-cost problem. They have opposite fixes.
2. **Ranked view second.** It sorts components by time in the selected commit, so the expensive one
   is at the top rather than somewhere in a tree.
3. **"Why did this render" third**, on the components that appear in commits they should not.

The companion is the **Components ⚛** panel's **"Highlight updates when components render"**
setting, which outlines components on the device as they re-render. Tapping a button and watching
the whole screen flash is a diagnosis in about two seconds — much faster than a recording when the
problem is that obvious.

### Heap snapshots

The **Memory** panel takes snapshots of the Hermes heap. The technique that finds leaks is always
the same:

1. Get the app to a steady state and take a snapshot.
2. Perform a complete cycle — open a screen, interact, close it, return to where you started.
3. Take a second snapshot and compare.

Anything that grew across a cycle that should have been symmetric is a retention problem, and the
retainer path in the snapshot tells you what is holding it.

A snapshot shows the **JavaScript heap only**. Decoded images, views and native module state are
invisible here. See [Memory](memory.md).

### Platform traces

When the Performance panel shows an idle JS thread and the UI still stutters, the cost is on the
main thread or in native code and no JavaScript tool will show it.

:::tabs
@tab Android
Capture a system trace through **Developer options → System Tracing**, pull the file and open it at
`ui.perfetto.dev`. Android Studio's profiler captures the same data while attached.

The tracks to look at are the main (UI) thread, the JavaScript thread, and the RenderThread.
`Systrace` markers from your JavaScript appear on the JS thread track, which is what lets you line
up your code against framework work.

For a fast first look with no capture workflow:

```bash
adb shell dumpsys gfxinfo com.example.app framestats
```

That prints per-frame timing without any tooling, which is often enough to confirm whether frames
are being dropped at all.
@tab iOS
Use **Instruments** (Xcode → Open Developer Tool → Instruments) attached to a Release build on a
device.

- **Time Profiler** — samples all threads. The main thread track separates mount and native work
  from JavaScript.
- **Allocations** / **Leaks** — native memory growth.
- **App Launch** — the startup breakdown, which no JavaScript tool can give you. See
  [Startup Time](startup-time.md).

The simulator runs your Mac's CPU with a different graphics stack. Never conclude anything about
performance from it.
:::

## Common patterns

### Profile one interaction, not one session

Start the recording immediately before the interaction and stop immediately after. The resulting
flame chart has one story in it.

### Use the Components highlighter before you record anything

Turning on **"Highlight updates when components render"** and poking the screen finds most
over-rendering problems without a single recording. Reach for the Profiler when the highlighter
shows something you do not understand.

### Compare like with like

Two recordings, same device, same build type, same starting state, same interaction. Changing two
variables between recordings makes the comparison worthless.

### Keep the fix's measurement outside the profiler

Confirm the improvement with a plain timing — a `Systrace` region, an `am start -W` number, a
stopwatch on a scripted scroll. Profiler-to-profiler comparisons carry the profiler's overhead in
both numbers and can hide a regression.

### Write down what you found

"Commit count on search drops from 40 to 2 after hoisting `renderItem`" is a note that saves the
next person a day. A merged diff with no explanation is not.

## Performance considerations

- **Every profiler perturbs what it measures.** Sampling adds per-sample cost, React's profiler adds
  per-commit bookkeeping, and "why did this render" adds more.
- **Do not profile cold start with the debugger attached.** Attaching changes startup substantially;
  use the platform's launch tooling instead.
- **Render counts are reliable under the profiler even when durations are not.** That is the number
  most memoization decisions need anyway.
- **Sampling misses very short functions.** A thousand calls at 0.1 ms each may show up as a wide
  parent frame with no obvious child. Add a `Systrace` marker to confirm.
- **Heap snapshots pause JavaScript** while they are taken. Expect a visible stall; it is not a bug.

## Common mistakes

- **Profiling a debug build.** Wrong: a flame chart from `npm run android`. Right: Release, on a
  device.
- **Recording for thirty seconds.** Wrong: start recording, use the app, stop, hunt. Right: record
  exactly the interaction that is slow.
- **Reading depth as cost.** Wrong: "this stack is 40 frames deep, that's the problem". Right: width
  is time; depth is only nesting.
- **Forgetting "why did this render".** Wrong: a Profiler recording that shows durations and no
  cause, then guessing at memoization. Right: enable the setting before recording.
- **Expecting a heap snapshot to show images.** Wrong: concluding there is no memory problem from a
  small JS heap. Right: bitmaps are native; use Instruments or Android Studio.
- **Reaching for `npx react-devtools`.** Wrong: the standalone tool — its WebSocket support was
  removed in 0.87. Right: the Components ⚛ and Profiler ⚛ panels inside React Native DevTools.
- **Comparing a profiled run with an unprofiled one.** Wrong: "it was 80 ms in the profiler and it's
  50 ms now". Right: measure both the same way.

## Related topics

- [React Native DevTools](../debugging/react-native-devtools.md) — opening it, connecting, and the non-performance panels.
- [Measuring Before Optimising](measuring-first.md) — the discipline these tools serve.
- [Render Performance and Memoization](render-performance.md) — acting on a Profiler result.
- [Memory](memory.md) — interpreting a heap snapshot comparison.
- [Startup Time](startup-time.md) — the measurement a profiler cannot take for you.
- [The Render Pipeline](../core-concepts/render-pipeline.md) — which phase a cost belongs to.
- [Network Inspection](../debugging/network-inspection.md) — when the delay is not computation at all.
