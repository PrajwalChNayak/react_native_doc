---
title: Running on the Web
description: What Expo SDK 57 actually supports in the browser — react-native-web, the three web output modes, static rendering and where the parity ends.
status: current
toolchain: expo
sdk: 57
---

Expo bundles for the web with the same Metro pipeline it uses for native, mapping
`react-native` imports to `react-native-web`. The result is a real web app: your `View` and
`Text` components render to DOM elements, Fast Refresh works, and `npx expo export` produces
static files you can host anywhere.

What it is not is a promise of parity. Plenty of the SDK has no web implementation, and the
honest way to use the web target is to know in advance which parts of your app will work.

## Basic example

The default template already has everything web needs. Start the dev server and press `w`, or:

```bash
npx expo start --web
```

Build for production:

```bash
npx expo export --platform web
```

That writes to `dist/` by default. `--output-dir <dir>` changes it.

## Why it exists / when to use it — and when NOT to

The web target earns its keep in three situations:

- **A marketing or content surface that shares code with the app** — shared design system,
  shared data layer, one repository.
- **A fast layout and logic loop.** Browser devtools, no simulator boot time, instant reload.
  Useful even for an app that will never ship to the web.
- **Sharing a preview with someone who cannot install a build.** A URL is easier than
  distributing a binary.

It is the wrong tool when your app's value is in native capability — camera, background
tasks, biometrics, notifications, high-frequency gestures. Those either do not exist on web
or behave differently enough that maintaining the web path costs more than it returns.

## How it works

### Required packages

```bash
npx expo install react-dom react-native-web @expo/metro-runtime
```

The default template includes `react-dom@19.2.3` and `react-native-web@~0.21.0` already.
`react-dom` is genuinely required — the CLI refuses to start web without it. `react-native-web`
is technically optional but not in practice: without it the CLI warns that "Some React Native
components may not work on web without it", which is another way of saying your app will not
render.

If you never want a web target, remove it from the config rather than leaving it half
configured:

```json title=app.json
{
  "expo": {
    "platforms": ["ios", "android"]
  }
}
```

The CLI then refuses `--web` with a clear message instead of prompting you to install web
dependencies.

### The three output modes

`web.output` controls what `npx expo start` serves and what `npx expo export` writes.
Verified against the SDK 57 config schema:

| `web.output` | What you get | Indexable HTML |
| --- | --- | --- |
| `single` | A single-page app: one `index.html`, everything client-rendered. **This is the schema default.** | No |
| `static` | One statically rendered HTML file per route in `app/`. Expo Router only. | Yes |
| `server` | Static HTML plus API Routes, for hosting behind a Node.js server. | Yes |

```json title=app.json
{
  "expo": {
    "web": {
      "output": "static",
      "favicon": "./assets/images/favicon.png"
    }
  }
}
```

**The SDK 57 default template sets `"output": "static"`,** even though the schema default is
`single`. If you created your project from the default template, you are on static rendering
already.

### What static rendering does and does not do

`static` renders each route to HTML and CSS at build time. That is what makes the pages
indexable and makes the first paint fast.

The constraints are real and worth knowing before you commit:

- **Dynamic routes do not work out of the box.** A route like `src/app/[id].tsx` has no known
  value for `id` at build time. You supply the list with `generateStaticParams()`.
- **There is no request-time rendering.** Expo's documentation is explicit that rendering at
  request time is not supported with `web.output: 'static'`. If you need per-request HTML,
  that is what `server` is for.
- **Data loaders run during the build**, and their results are embedded in the output HTML.

[Static Rendering](../expo-router/api-routes.md) territory overlaps with API Routes; the
router section covers both.

### `server` output and API Routes

`output: 'server'` emits static HTML plus server-side API Routes, which need a Node.js host
rather than a static file host. `npx expo export --platform web --no-ssg` (alias
`--api-only`) exports only the API routes, skipping static HTML.

See [API Routes](../expo-router/api-routes.md).

### The bundler

`web.bundler` accepts `'webpack'` or `'metro'`. Metro is the default unless
`@expo/webpack-config` is installed. **Use Metro.** It is the same bundler as native, which
is what makes one Fast Refresh loop, one config file and one resolver behave consistently
across all three platforms. The webpack path exists for old projects.

### DOM components: the escape hatch for web-only libraries

SDK 57 supports the `'use dom'` directive, which runs a React DOM component inside a WebView
on native platforms. It is how you use a web-only library — a rich text editor, a charting
library with no native port — inside a native app.

`@expo/dom-webview` ships with SDK 56 and later, so no extra install is needed. The documented
limitations are sharp:

- You cannot pass `children` to a DOM component.
- Function props must be asynchronous; they cannot return values synchronously.
- You cannot put native views inside one.
- Instances do not share data with each other automatically.
- DOM components can only be embedded — they do not support OTA updates.

Reach for this when a library genuinely has no native equivalent, not as a general porting
strategy.

## Platform differences

The differences are the point of this page, so they get a table rather than tabs.

| Area | Native | Web |
| --- | --- | --- |
| Layout | Yoga | CSS flexbox via `react-native-web` — close, not identical |
| `Platform.OS` | `'ios'` / `'android'` | `'web'` |
| Shadows | `shadow*` on iOS, `elevation` on Android | `box-shadow`; the native props map imperfectly |
| Most `expo-*` modules | Native implementation | Many have a web implementation, some do not, a few are no-ops |
| Secure storage | Keychain / Keystore | No equivalent. Do not assume `expo-secure-store` protects anything in a browser |
| Push notifications | Supported | Different mechanism entirely |
| Fonts, images, gestures | Native | Supported via `react-native-web` and the web builds of the SDK modules |

Write platform-specific code with file extensions rather than branching everywhere — the
default template does exactly this with `use-color-scheme.ts` and `use-color-scheme.web.ts`,
and with `animated-icon.tsx` alongside `animated-icon.web.tsx`.

```tsx title=src/components/platform-note.tsx
import {Platform, Text} from 'react-native';

export function PlatformNote() {
  // Prefer .web.tsx files over branching when the whole component differs.
  // Inline checks are for small divergences like this one.
  return <Text>{Platform.OS === 'web' ? 'In a browser' : 'On a device'}</Text>;
}
```

## Common patterns

### Check module support before you rely on it

Every SDK library's documentation lists the platforms it supports. Check before building a
feature on it, not after. A module without web support does not fail at build time — it
fails when the code path runs in a browser, which may be much later.

### Keep the web build honest with a CI export

```bash
npx expo export --platform web
```

Adding this to CI catches the class of breakage where a native-only import gets pulled into
a shared module and the web bundle stops building. It is cheap and it fails loudly.

### Do not treat the browser as a secure environment

Everything in the web bundle is readable by anyone who opens devtools. This is true of the
native bundle too, but people forget it faster on the web because the tooling makes it
trivial. See
[What Ships Inside the Bundle](../expo-security/what-ships-in-the-bundle.md) and
[EXPO_PUBLIC_ Variables and the Leak They Cause](../expo-security/expo-public-env-vars.md).

## Common mistakes

- **Assuming the schema default is what your project uses.** The schema default for
  `web.output` is `single`; the SDK 57 default template sets `static`. Check your `app.json`
  rather than assuming.
- **Expecting dynamic routes to work under `static` output.** They need
  `generateStaticParams()`. Without it the route is simply not emitted.
- **Expecting server-side rendering from `output: 'static'`.** Rendering at request time is
  not supported in that mode. Use `server`.
- **Reaching for webpack.** Metro is the default and the supported path. The webpack config
  package exists for legacy projects.
- **Assuming an `expo-*` module works on web because it is in the SDK.** Support is
  per-module. `expo-secure-store` in particular does not give you Keychain-grade protection
  in a browser, and treating it as if it does is a security bug.
- **Using `'use dom'` to port a screen.** It is a WebView with restrictions — no children, no
  native views inside, async-only function props, no OTA updates. It is for one stubborn
  library, not for a screen.
- **Skipping the web export in CI.** The web build breaks quietly when a native-only import
  drifts into shared code.

## Related topics

- [Running on a Simulator](running-on-a-simulator.md) — the native side of the same dev server.
- [The Dev Server and Fast Refresh](dev-server-and-fast-refresh.md) — the `w` key and the shared Metro pipeline.
- [The App Config](../expo-core-concepts/app-config.md) — every `web.*` key and the `platforms` array.
- [API Routes](../expo-router/api-routes.md) — what `output: 'server'` is for.
- [Typed Routes](../expo-router/typed-routes.md) — routing the web target shares with native.
- [Bundle Size and Tree Shaking](../expo-performance/bundle-size.md) — what ships to the browser.
- [What Ships Inside the Bundle](../expo-security/what-ships-in-the-bundle.md) — why the browser is not a secret store.
- [EXPO_PUBLIC_ Variables and the Leak They Cause](../expo-security/expo-public-env-vars.md) — the most common web-side leak.
