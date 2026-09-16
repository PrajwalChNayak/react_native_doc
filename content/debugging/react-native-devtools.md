---
title: React Native DevTools
description: The built-in debugger — how to open it in 0.87, what each panel does, how it connects over the Chrome DevTools Protocol, and what it cannot do.
status: current
toolchain: cli
---

React Native DevTools is the debugger that ships with React Native. It is a Chrome DevTools frontend
that talks to Hermes over the **Chrome DevTools Protocol (CDP)**, which Hermes implements directly.
That means breakpoints, stepping, a console bound to the real runtime, and a profiler — in the
engine your app actually ships with, rather than in a desktop browser engine pretending to be it.

It replaced a scattering of older tools, and in 0.87 it is the only supported one.

## Why it exists / when to use it — and when NOT to

Before it existed, debugging a React Native app meant choosing between tools that each saw part of
the picture: a remote debugger that ran your JavaScript in Chrome's engine (so the numbers were
wrong and native calls behaved differently), a standalone component inspector in another terminal,
and a separate network inspector.

React Native DevTools sees one runtime: the Hermes instance in your app, on the device.

**When not to use it:**

- **Release builds.** The inspector is a development feature. A release build has no debugger to
  attach to — that is what [Crash Reporting](crash-reporting.md) and
  [Reading a Release Stack Trace](release-stack-traces.md) are for.
- **Performance measurement of startup.** Attaching the debugger changes startup materially. Use the
  platform launch tools instead; see [Startup Time](../performance/startup-time.md).
- **Native crashes.** A JavaScript debugger cannot see a native signal. See
  [Native Crash Logs](native-crash-logs.md).

> [!WARNING] Standalone react-devtools was removed
> Its WebSocket support was removed in 0.87. Do not run `npx react-devtools` — the component
> inspector and the React profiler are **panels inside React Native DevTools** now.

## Basic example — opening it

Start Metro, run the app, then either:

```bash
npm start
# In the Metro terminal:
#   r  - reload app(s)
#   d  - open Dev Menu
#   j  - open DevTools
```

Those three key bindings are exactly what the 0.87 CLI registers, printed by Metro itself when it
starts in an interactive terminal.

Or open the **Dev Menu** on the device and choose **Open DevTools**:

:::tabs
@tab iOS
<kbd>Cmd</kbd>+<kbd>D</kbd> on the simulator, or shake a physical device.
@tab Android
<kbd>Ctrl</kbd>+<kbd>M</kbd> on the emulator, or shake a physical device. The Dev Menu's entries in
0.87 include **Reload**, **Open DevTools**, **Toggle Element Inspector**, **Show Perf Monitor**,
**Enable Fast Refresh**, **Change Bundle Location**, **Capture Heap** and **Settings**.
:::

### When several devices are connected

Pressing <kbd>j</kbd> with more than one app or device attached prints a numbered list of debug
targets in the Metro terminal; press the matching digit to open that one. Up to nine are shown. With
exactly one target it opens immediately, and with none it tells you there are no connected targets.

## How it works

### The connection path

1. Your app registers itself with the dev server over a WebSocket (`/inspector/device`).
2. The dev server's **Inspector Proxy** tracks every connected device and app, and exposes them as
   CDP targets at `GET /json/list`.
3. Opening the debugger is an HTTP call — `POST /open-debugger?target=<id>` — which is literally
   what pressing <kbd>j</kbd> does.
4. The frontend connects through `/inspector/debug`, which proxies CDP messages to and from the
   device.

You can drive that by hand when something is stuck:

```bash
# What is actually connected?
curl -s http://localhost:8081/json/list

# Open the debugger for a specific target id.
curl -X POST 'http://localhost:8081/open-debugger?target=<targetId>'
```

That is often the fastest way to answer "is the app connected at all, or is the tooling broken".

### Where the window opens

Since React Native 0.83 the frontend launches in a **standalone app shell** rather than a browser
tab, provided by the `@react-native/debugger-shell` package. The shell binary is downloaded and
cached in the background when the dev server starts; if that download or launch fails, the frontend
falls back to opening in a browser window until the next dev server start.

Practical consequence: the first `j` after a fresh `npm install` on a new machine can be slower, or
can land in a browser. That is the fallback, not a broken setup.

### The panels

| Panel | What it is for |
| --- | --- |
| **Console** | Your logs, bound to the real runtime. Evaluate expressions against live app state. |
| **Sources** | Breakpoints, stepping, watch expressions, and your original files via source maps. |
| **Network** | Requests, timing, headers and payloads. See [Network Inspection](network-inspection.md). |
| **Performance** | A sampled JavaScript flame chart. See [The Profiler and React Native DevTools](../performance/profiling.md). |
| **Memory** | Heap snapshots of the Hermes heap. See [Memory](../performance/memory.md). |
| **Components ⚛** | React DevTools: the component tree, props, state and hooks. |
| **Profiler ⚛** | React DevTools: per-commit render data and why each component rendered. |
| **Issues** | Diagnostics reported by the runtime. |

The two panels with the ⚛ suffix are React DevTools proper, embedded rather than run separately.

### Sources and breakpoints

Breakpoints work the way they do on the web, because it is the same protocol. Two React
Native-specific notes:

- A `debugger;` statement in your code stops execution when DevTools is attached and is ignored when
  it is not. It is the most reliable way to break inside code that runs before you can click.
- The files you see are your **original sources**, reconstructed through Metro's source map. If you
  are looking at minified code, the map is missing — see [Source Maps](source-maps.md).

### Inspecting components

The **Components ⚛** panel shows the React tree with props, state and hook values, and lets you edit
them live. Two settings in it earn their keep:

- **"Highlight updates when components render"** outlines components on the device as they
  re-render. Tap a button, watch the whole screen flash, and you have diagnosed an over-rendering
  problem in two seconds.
- Selecting a component and using the element picker maps a thing on screen to a thing in the tree,
  which is faster than reading JSX.

The Dev Menu's **Toggle Element Inspector** is the on-device counterpart: it overlays box model and
styling information without a debugger connection at all.

## Platform differences

The protocol, the frontend and the panels are identical on both platforms — that is the point of
building on CDP. What differs is how you reach the Dev Menu and how the device finds the dev server.

:::tabs
@tab iOS
Simulator: <kbd>Cmd</kbd>+<kbd>D</kbd>. Physical device: shake, and the device must be able to reach
your machine's dev server over the network.

The iOS simulator shares the host's network, so `localhost:8081` resolves without any setup.
@tab Android
Emulator: <kbd>Ctrl</kbd>+<kbd>M</kbd>. Physical device over USB, the dev server needs a port
forward:

```bash
adb reverse tcp:8081 tcp:8081
```

Without that, a USB-connected device cannot reach Metro and the app will fail to load the bundle
before you get anywhere near the debugger. **Change Bundle Location** in the Dev Menu is the manual
alternative when you are on Wi-Fi.
:::

## Common patterns

### Check `/json/list` when nothing connects

If <kbd>j</kbd> does nothing useful, `curl http://localhost:8081/json/list` tells you whether the app
registered at all. An empty array means the problem is between the app and the dev server — wrong
host, no `adb reverse`, or the app is running a bundled (release) build.

### Use the Console against live state

The console evaluates in the app's runtime. You can call a module's exported function, read a store,
or trigger a navigation — all against the running app. This is frequently faster than adding a log
and reloading.

### Keep the debugger closed when measuring

Attaching changes timing. Profile with the tools, then detach before taking any number you intend to
compare.

### Reconnect after a reload

A full reload tears down the runtime and therefore the CDP session. The frontend generally
reattaches; when it does not, press <kbd>j</kbd> again rather than restarting Metro.

## Security considerations

**Threat.** The dev server's inspector endpoints expose your app's runtime to anything that can
reach the port. With `adb reverse` or a Wi-Fi connection, that can be more than just your machine.

**Exploit.** Anyone who can reach `http://<your-machine>:8081/json/list` can enumerate connected
targets, and through `/inspector/debug` can evaluate arbitrary JavaScript in the app — reading
tokens, state and anything else in the runtime.

**Fix.** Treat the dev server as a development-only service on a trusted network. Do not run it on
an untrusted network, do not forward port 8081 publicly, and never ship a debug build. The debugger
is not present in a release build at all, which is the real protection.

**Verification.** From another machine on the same network, try
`curl http://<your-ip>:8081/json/list`. If it answers, so would an attacker on that network. Then
install your release build and confirm the same request returns nothing for it.

## Common mistakes

- **Running `npx react-devtools`.** Wrong: the standalone tool. Right: it was removed in 0.87 — use
  the Components ⚛ and Profiler ⚛ panels.
- **Expecting the debugger in a release build.** Wrong: trying to attach to a store build. Right:
  the inspector is a development feature; use crash reporting and source maps.
- **Debugging a USB device without a port forward.** Wrong: assuming the device can reach your
  machine. Right: `adb reverse tcp:8081 tcp:8081`, or set the bundle location manually.
- **Profiling with the debugger attached and comparing to a detached run.** Wrong: mixing the two.
  Right: measure both the same way.
- **Reading minified code in Sources and assuming that is normal.** Wrong: debugging optimised
  output. Right: the source map is missing or broken; see [Source Maps](source-maps.md).
- **Restarting Metro because the debugger disconnected.** Wrong: a full restart for every reload.
  Right: press <kbd>j</kbd> again; the session is per-runtime.
- **Leaving the dev server running on a public network.** Wrong: treating port 8081 as harmless.
  Right: it grants arbitrary evaluation in your app's runtime.

## Related topics

- [Console and Logs](console-and-logs.md) — what the Console shows and where logs go without it.
- [Network Inspection](network-inspection.md) — the Network panel and its limits.
- [Source Maps](source-maps.md) — why Sources shows your original files.
- [The Profiler and React Native DevTools](../performance/profiling.md) — the recording workflow.
- [Memory](../performance/memory.md) — heap snapshots and what they do not include.
- [Dev Menu and Fast Refresh](../getting-started/dev-menu-and-fast-refresh.md) — the rest of the Dev Menu.
- [Hermes](../core-concepts/hermes.md) — the engine implementing the protocol.
- [Debugging Native Code](../native-modules/debugging-native-code.md) — when the problem is below JavaScript.
