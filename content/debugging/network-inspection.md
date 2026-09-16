---
title: Network Inspection
description: The Network panel in React Native DevTools, exactly which requests it can and cannot see, and the proxy workflow for everything else.
status: current
toolchain: cli
---

The **Network** panel in [React Native DevTools](react-native-devtools.md) lists the requests your
app makes, with timing, headers and payloads, in the same frontend you use for breakpoints. For
anything your JavaScript initiates, it is the fastest answer to "did that request go out, what did
it carry, and what came back".

It is also the tool whose boundaries are least obvious. A significant share of an app's traffic is
initiated below JavaScript and never appears in the panel at all. Knowing where that line sits saves
you from concluding that a request was never made when it was made and simply not reported.

## Why it exists / when to use it — and when NOT to

Use the Network panel when the question is about a request you wrote: the URL, the headers, the
body, the status, the ordering, the duration.

Reach for something else when:

- **The traffic comes from a native module or an SDK.** Analytics, ads, push registration, a native
  HTTP client inside a third-party library — none of it is visible here. Use a proxy.
- **You need to modify a request or a response.** The panel observes; it does not rewrite. Use a
  proxy with a rule, or a local mock server.
- **The app is a release build.** CDP network reporting is disabled in a production build by
  design. A proxy still works on a release build, subject to the trust caveats below.
- **The question is really about caching or retries.** That behaviour lives in your data layer. See
  [Data Fetching and Caching](../state-and-data/data-fetching.md).

## Basic example

Open DevTools (press <kbd>j</kbd> in the Metro terminal), select **Network**, and reproduce the
request. A `fetch` from your code appears immediately.

```ts title=src/api/orders.ts
import 'react-native';

type Order = {id: string; total: number};

/**
 * A plain fetch. Everything about this call — method, URL, request headers,
 * request body, status, response headers and response body — shows up in the
 * Network panel, because RN's fetch is built on its own networking module and
 * that module is instrumented for the debugger.
 */
export async function fetchOrder(id: string): Promise<Order> {
  const response = await fetch(`https://api.example.com/orders/${id}`, {
    headers: {Accept: 'application/json'},
  });
  if (!response.ok) {
    throw new Error(`order ${id}: ${response.status}`);
  }
  return (await response.json()) as Order;
}
```

The panel is most useful with a **request id header** that your server also logs. Then a slow or
failed request in the panel maps to a specific server-side trace without guessing.

## How it works

### The instrumentation is native, not a JavaScript patch

This is worth understanding because it explains the limitation precisely.

React Native's `fetch` is implemented on top of its `XMLHttpRequest`, which is backed by a native
networking module — `RCTNetworking` on iOS, the networking module built on OkHttp on Android. That
native layer is instrumented: it reports request start, connection timing, response start, data
received, response end and failures to a shared `NetworkReporter`, which emits **CDP `Network.*`
domain events** to the debugger.

So the panel is not a monkey-patched `fetch`. It is the real transport reporting on itself, which is
why the timings are meaningful and why redirects and failures show up correctly.

The same instrumentation feeds Web Performance resource timings, and React Native's headers describe
it as **experimental** — treat the finer-grained timing fields as informative rather than
contractual.

### What the panel sees, and what it does not

| Traffic | Visible in the panel | Why |
| --- | --- | --- |
| `fetch` from your JavaScript | Yes | Goes through the instrumented networking module |
| `XMLHttpRequest` from your JavaScript | Yes | Same module |
| A library that uses `fetch` or `XHR` under the hood | Yes | Still the same module |
| `<Image source={{uri}} />` loading | **No** | Images load through the native image loader, not the networking module |
| A TurboModule making its own HTTP call | **No** | Uses `URLSession` / OkHttp directly |
| A third-party native SDK's traffic | **No** | Same reason |
| WebSocket frames | **No** | Not reported through the network domain |
| Traffic from a `WebView` | **No** | The web view has its own network stack |
| Anything in a release build | **No** | CDP reporting is disabled in production builds |

> [!WARNING] "It is not in the panel" does not mean "it did not happen"
> Four of the rows above are traffic your app really makes, really pays for, and really leaks
> through if it is misconfigured. An empty Network panel is evidence about your JavaScript, not
> about your app.

That table is the single most useful thing on this page. A request that is missing from the panel is
usually a request from below JavaScript, and chasing it as a JavaScript bug wastes hours.

### Correlating with the rest of the tooling

The Network panel gives you timing on the wire. It does not tell you what the JS thread was doing
while waiting, or how long rendering the result took. When "the screen is slow" turns out to be a
600 ms request plus a 400 ms render, you need both the panel and a Performance recording — see
[The Profiler and React Native DevTools](../performance/profiling.md).

## Platform differences

The panel itself is identical on both platforms, because both native networking modules report
through the same reporter into the same protocol.

The differences appear in the escape hatch — proxying — and they are significant enough to need
their own tabs below.

## Common patterns

### Seeing native-side traffic: an intercepting proxy

When the request is not in the panel, put a proxy between the device and the network. This is the
only approach that sees everything: JavaScript requests, native module requests, image loads, SDK
telemetry, and web view traffic.

The shape is always the same, whichever proxy you use — `mitmproxy`, or a desktop tool such as
Charles or Proxyman:

1. Run the proxy on your machine and note its listening port.
2. Point the device at your machine's IP and that port.
3. Install the proxy's CA certificate on the device and mark it trusted.
4. Make the app trust user-installed CAs — this is the step that differs per platform.

```bash
# One common option; the workflow below is the same for any intercepting proxy.
mitmproxy --listen-port 8080
# The CA it generates lives in ~/.mitmproxy/ and is what you install on the device.
```

> [!DANGER] You are installing a root CA on a device
> A trusted root CA can impersonate **every** HTTPS site that device visits, not only your app's
> API. Use a device you control and use for development. Remove the certificate when you are done.
> Never walk a user, a tester outside your team, or a customer through this on their own phone.

:::tabs
@tab Android

Point the device at the proxy:

```bash
# Emulator or device on the same network. Use your machine's LAN IP.
adb shell settings put global http_proxy 192.168.1.20:8080

# Undo it when you are finished.
adb shell settings delete global http_proxy
adb reboot
```

Install the CA: push the certificate to the device and add it through
**Settings → Security → Encryption & credentials → Install a certificate → CA certificate**. It
lands in the **user** trust store.

That is where Android 7 and later stops you: **apps do not trust user-installed CAs by default.**
Your app will keep failing TLS until you say otherwise, and the correct way to say otherwise is a
debug-only override:

```xml title=android/app/src/debug/res/xml/network_security_config.xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!--
      debug-overrides is honoured only when the app is debuggable, so this is
      inert in a release build. This file belongs in the DEBUG source set; the
      equivalent in base-config would ship.
    -->
    <debug-overrides>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

The full file, including what must never go in `base-config`, is in
[Network Security Config and ATS](../security/network-security-config.md).

@tab iOS

Point the device at the proxy in **Settings → Wi-Fi → (your network) → Configure Proxy → Manual**,
with your machine's IP and the proxy's port. The simulator uses the Mac's own network settings, so
a system-wide proxy on the Mac covers it.

Install the CA by opening the proxy's certificate URL in Safari on the device and accepting the
profile, then — and this is the step everyone misses — enable it explicitly:

**Settings → General → About → Certificate Trust Settings**, and switch on full trust for that root
certificate. Until you do, the certificate is installed and still not trusted, and the symptom is
identical to not having installed it.

On the simulator, trusting the CA in the Mac's keychain is what the simulator inherits.

App Transport Security applies on top of all this: an ATS exception is about which connections are
allowed, not about which CAs are trusted, and the two produce similar-looking failures. See
[Network Security Config and ATS](../security/network-security-config.md).

:::

### Certificate pinning defeats proxying — on purpose

If your app pins certificates, none of the above works, and that is the feature functioning
correctly. A pinned connection rejects the proxy's certificate no matter what the device trust store
says.

You have three honest options, in order of preference:

1. **Build a variant with pinning disabled** for debugging, and never ship it. Gate it on a build
   flavour, not a runtime flag.
2. **Use the Network panel** for the JavaScript half of the problem, where pinning is irrelevant
   because you are observing inside the app.
3. **Read the server's logs** instead of the client's traffic.

What you should not do is add a "disable pinning if a proxy is detected" path, because that ships a
bypass to everyone. The trade-offs, the rotation risk and the operational cost of pinning are
covered in [Certificate Pinning](../security/certificate-pinning.md).

### Add a request id and log it, not the payload

```ts title=src/api/client.ts
import 'react-native';

/**
 * Correlate a panel entry, a server log line and a crash report with one value.
 * Logging the id rather than the body is also what keeps credentials out of the
 * device log.
 */
export async function request(path: string, init?: RequestInit): Promise<Response> {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const response = await fetch(`https://api.example.com${path}`, {
    ...init,
    headers: {...init?.headers, 'X-Request-Id': requestId},
  });
  if (__DEV__) {
    console.log(`${init?.method ?? 'GET'} ${path} -> ${response.status} id=${requestId}`);
  }
  return response;
}
```

### Reproduce with `curl` before blaming the client

Copy the URL, method and headers out of the panel and run the same request from your machine. If it
fails there too, the problem is the server or the request shape, and no amount of client debugging
will find it.

### Use a local mock server when you need to change responses

The panel cannot rewrite a response and a proxy rule is fiddly to maintain. Pointing the app at a
local server that returns exactly the payload you want to test is usually faster, and it is
repeatable in tests.

## Performance considerations

- **The panel retains request and response bodies** for the session. Inspecting a screen that
  downloads large payloads repeatedly grows the frontend's memory. Clear the panel between runs.
- **Recording adds overhead to every request.** Do not take latency numbers from a debugging session
  and compare them with production.
- **A proxy adds a hop and terminates TLS twice.** Timing through a proxy is directionally useful
  and not a measurement.
- **Request count matters more than request size on mobile.** The panel's waterfall is the fastest
  way to spot an N+1 request pattern on a screen — a list that fetches per row is obvious there and
  invisible everywhere else.

## Security considerations

**Threat.** Everything the Network panel shows you — tokens in `Authorization` headers, session
cookies, personal data in response bodies — is equally visible to anyone who can get between the
device and your server, or who can attach a debugger to a development build.

**Exploit.** With a proxy trusted on the device, an attacker or an analyst reads and rewrites your
entire API conversation:

```bash
# Record every flow to a file for later reading.
mitmdump --listen-port 8080 -w flows.mitm
```

On a development build with `debug-overrides` trusting user CAs, this needs no exploit at all — it
is the documented workflow above.

**Fix.**

- Keep `<certificates src="user" />` inside `debug-overrides` and inside the **debug** source set,
  never in `base-config` and never in `main`. A release build must not trust user CAs.
- Never ship a build with pinning disabled by a runtime flag an attacker can flip.
- Assume the transport is observable and design the API accordingly: short-lived tokens,
  server-side authorisation on every action, no secrets in the client. See
  [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md).
- Remove proxy CAs from your development devices when you finish.

**Verification.** Install your **release** build, set up the proxy exactly as above, and attempt to
intercept. The connection should fail. If you can read your release traffic through a user-installed
CA, a debug configuration has leaked into the release build — check which source set your network
security config came from:

```bash
grep -rn "certificates src=\"user\"" android/app/src/
```

Anything outside `android/app/src/debug/` is a finding.

## Common mistakes

- **Concluding a request was never made because the panel is empty.** Wrong: it only sees JavaScript
  traffic. Right: image loads, native modules, SDKs and web views are invisible here — use a proxy.
- **Expecting image requests in the panel.** Wrong: debugging a broken image by looking for its URL.
  Right: images go through the native image loader; see
  [Image Performance and Caching](../performance/image-performance.md).
- **Trying to inspect a release build.** Wrong: attaching DevTools to a store build. Right: CDP
  network reporting is disabled in production builds.
- **Installing a proxy CA on Android and stopping there.** Wrong: expecting interception to work.
  Right: apps ignore user CAs since Android 7 — you also need a `debug-overrides` trust anchor.
- **Installing a profile on iOS without enabling full trust.** Wrong: assuming the profile is
  enough. Right: **Settings → General → About → Certificate Trust Settings** is a separate switch.
- **Putting `<certificates src="user" />` in `base-config`.** Wrong: "it fixed the proxy". Right:
  that ships an app that trusts any CA a user or attacker installs.
- **Adding a runtime switch that disables pinning.** Wrong: a flag so QA can proxy. Right: a
  separate build variant, or accept that pinned traffic is not proxyable — that is the point.
- **Timing requests through a proxy and calling it a measurement.** Wrong: comparing proxied latency
  with production. Right: measure without the proxy attached.
- **Leaving the proxy CA installed on your phone.** Wrong: forgetting about it after the bug is
  fixed. Right: it can impersonate every site you visit; remove it.

## Related topics

- [React Native DevTools](react-native-devtools.md) — opening the panel and the rest of the frontend.
- [Console and Logs](console-and-logs.md) — logging request identifiers rather than payloads.
- [Certificate Pinning](../security/certificate-pinning.md) — why pinning defeats proxying by design.
- [Network Security Config and ATS](../security/network-security-config.md) — the trust configuration this page depends on.
- [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md) — what an observer of your traffic already has.
- [Data Fetching and Caching](../state-and-data/data-fetching.md) — the layer that decides how many requests there are.
- [The Profiler and React Native DevTools](../performance/profiling.md) — separating wire time from render time.
- [Image Performance and Caching](../performance/image-performance.md) — the traffic the panel cannot show you.
