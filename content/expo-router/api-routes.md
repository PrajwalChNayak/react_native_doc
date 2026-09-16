---
title: API Routes
description: Server endpoints defined as +api.ts files in an Expo Router 57 project — what web.output server requires, the handler signature, calling routes from native, and the honest hosting story.
status: current
toolchain: expo
sdk: 57
---

An API route is a file in `app/` whose name ends in `+api.ts`. Instead of a screen, it exports
functions named after HTTP methods, and those functions run **on a server** when a request arrives
at that path.

```ts title=src/app/api/hello+api.ts
export function GET(request: Request) {
  return Response.json({hello: 'world'});
}
```

That is a working endpoint at `/api/hello` — once there is a server to run it. Nothing in your app
binary executes this code. API routes are supported in SDK 57, but they are a **web server
feature**: they need `web.output: "server"`, an export step, and hosting that can run
server-side JavaScript.

## Why it exists / when to use it — and when NOT to

API routes let you keep server code in the same repository, next to the routes that call it, using
the same file conventions. Typical uses:

- **Holding a secret** — calling a third-party API with a key that must never ship in the app
  bundle.
- **Aggregating or shaping data** for the app, so the client makes one request instead of five.
- **Webhooks** from a payment provider or other service.

Do **not** choose them expecting free hosting, or expecting them to run "inside" the native app.
They are server code, and you are operating a server:

- You need somewhere to deploy it. EAS Hosting is Expo's paid hosted service with a free tier; the
  alternatives are adapters for platforms such as Express, Bun, Netlify and Vercel, each with its
  own costs and limits. Check the current terms of whichever you pick before committing.
- The native app talks to it over the network, so it is subject to latency, outages and versioning
  like any backend.

If you already have a backend, or your app has no server-side needs, you do not need API routes.
They are also a poor fit for long-running work, WebSockets, or code that needs native binaries.

## Basic example

**1. Switch the web output to `server`** in the app config. The SDK 57 template defaults to
`static`, which pre-renders HTML and cannot run request-time code:

```json title=app.json
{
  "expo": {
    "web": {"output": "server"},
    "plugins": [["expo-router", {"origin": "https://api.example.com"}]]
  }
}
```

**2. Create the route:**

```ts title=src/app/api/posts/[id]+api.ts
export async function GET(request: Request, {id}: Record<string, string>) {
  // `id` comes from the URL. Validate it like any other untrusted input.
  if (!/^[0-9]{1,10}$/.test(id)) {
    return Response.json({error: 'invalid id'}, {status: 400});
  }
  return Response.json({id, title: `Post ${id}`});
}
```

**3. Run the dev server** and call it:

```bash
npx expo start
curl http://localhost:8081/api/posts/42
```

In development, the Expo dev server serves API routes itself, so this works before you have hosting.

## How it works

### Filenames

API routes use the same routing rules as screens, with `+api` before the extension:

| File | Endpoint |
| --- | --- |
| `src/app/api/hello+api.ts` | `/api/hello` |
| `src/app/api/posts/[id]+api.ts` | `/api/posts/42` |
| `src/app/api/files/[...path]+api.ts` | `/api/files/a/b` |

An API route and a screen can share a path, but that is confusing to read and debug. Keeping API
routes under an `api/` directory avoids the question. Platform extensions do not apply: a file named
`hello+api.web.ts` is not an API route.

### Handlers

Export one function per method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`. A
method you do not export returns `405`. Each handler receives the standard Fetch API `Request` and
the route parameters, and returns a `Response`. `expo-router/server` exports the type:

```ts title=src/app/api/posts+api.ts
import type {RequestHandler} from 'expo-router/server';

type NewPost = {title: string};

export const POST: RequestHandler = async (request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({error: 'expected JSON'}, {status: 400});
  }

  // The body is attacker-controlled. Check its shape before using it.
  if (typeof body !== 'object' || body === null || typeof (body as NewPost).title !== 'string') {
    return Response.json({error: 'title is required'}, {status: 400});
  }

  return Response.json({created: (body as NewPost).title}, {status: 201});
};
```

### Server-side helpers from `expo-server`

`expo-server` 57.0.3 is a dependency of `expo-router` and exports request-scoped helpers. The ones
verified in its installed types:

| Export | Purpose |
| --- | --- |
| `StatusError` | throw to return an error response with a status code |
| `origin()` | the request's origin |
| `requestHeaders()` | an immutable copy of the request headers |
| `environment()` | the deployment environment name, or `null` for production |
| `runTask(fn)` | run a task concurrently and keep the request alive until it finishes |
| `deferTask(fn)` | run a task after the response is sent, such as analytics |
| `setResponseHeaders(update)` | merge headers into the response the handler returns |

### Calling routes from the app

On web, the page and the API share an origin, so a relative `fetch('/api/hello')` works. A native
app has no origin. The `origin` option on the `expo-router` config plugin sets the production
origin, and relative `fetch` calls in the app are resolved against it; in development the dev
server's origin is used.

```tsx title=src/app/index.tsx
import {useEffect, useState} from 'react';
import {Text} from 'react-native';

export default function Home() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/hello')
      .then((r) => r.json())
      .then((data: {hello: string}) => setMessage(data.hello))
      .catch(() => setMessage('offline'));
  }, []);

  return <Text>{message}</Text>;
}
```

If the relative form is unclear in your codebase, an absolute URL from configuration is equally
valid and easier to reason about.

### Deploying

Export produces a static client and a server bundle:

```bash
npx expo export --platform web
```

The server output then needs a host. Your options are EAS Hosting, or a server entry file that
delegates requests to one of the adapters `expo-server` ships under `expo-server/adapter/*`. The
installed `expo-server` 57.0.3 contains adapters named `bun`, `eas`, `express`, `http`, `netlify`,
`vercel` and `workerd`. Follow the Expo hosting guide for the one you choose; the entry file differs
per platform.

The Expo documentation lists constraints of the server build: code is transpiled to CommonJS,
dynamic imports are not supported, and packages that need platform-native binaries (image
libraries such as `sharp`, for example) will not work.

## Platform differences

| | iOS / Android app | Web |
| --- | --- | --- |
| Where the handler runs | on your server | on your server |
| How the app reaches it | network request to the configured origin | same-origin request |
| Works offline | no | no |
| Works in development | yes, through the dev server — but only while it is reachable from the device | yes |

A physical device reaching `localhost:8081` reaches **itself**, not your computer. Use the LAN
address the dev server prints, or a tunnel.

## Common patterns

### Keeping a secret server-side

```ts title=src/app/api/weather+api.ts
// In a project this reference comes from the generated expo-env.d.ts; it declares `process`.
/// <reference types="expo/types" />

export async function GET(request: Request) {
  const city = new URL(request.url).searchParams.get('city') ?? '';
  if (!/^[A-Za-z .-]{1,64}$/.test(city)) {
    return Response.json({error: 'invalid city'}, {status: 400});
  }

  // process.env on the server is not bundled into the app. Never prefix this EXPO_PUBLIC_.
  const key = process.env.WEATHER_API_KEY;
  if (!key) return Response.json({error: 'not configured'}, {status: 500});

  const upstream = await fetch(
    `https://weather.example.com/v1?city=${encodeURIComponent(city)}`,
    {headers: {Authorization: `Bearer ${key}`}},
  );
  return Response.json(await upstream.json(), {status: upstream.status});
}
```

The app calls `/api/weather?city=Oslo` and never holds the key. See
[What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md) for why this matters.

### Returning an error from deep inside a handler

```ts title=src/app/api/orders/[id]+api.ts
import {StatusError} from 'expo-server';

async function loadOrder(id: string): Promise<{id: string}> {
  if (!/^[a-z0-9]{8}$/.test(id)) {
    throw new StatusError(400, 'invalid order id');
  }
  return {id};
}

export async function GET(request: Request, {id}: Record<string, string>) {
  return Response.json(await loadOrder(id));
}
```

## Security considerations

**Threat.** An API route is a public HTTP endpoint. Anyone who can find the URL — by reading your
app's network traffic, which is straightforward — can call it with any method, headers and body,
without using your app.

**Exploit.** An endpoint that trusts the caller to say who they are:

```bash
curl -X DELETE "https://api.example.com/api/users/123"
```

If the handler deletes user 123 because the request asked, any user can delete any other.

**Fix.** Authenticate every non-public request from a credential the server verifies, and authorise
the action against that identity — not against a user id in the URL or body. Validate every
parameter and body field. Keep secrets in server environment variables, never in
`EXPO_PUBLIC_*` variables, which are inlined into the client bundle.

**Verification.** Call each endpoint with `curl` and no credentials; anything private must return
`401` or `403`. Then call it with a valid credential for a *different* user; it must still refuse.

## Common mistakes

- **Leaving `web.output` as `static`.** Static output pre-renders HTML and has no request-time
  server. API routes need `server`.
- **Expecting API routes to work in a release app with no hosting.** The dev server serves them in
  development only. A release build calls whatever origin you configured.
- **Assuming hosting is free.** EAS Hosting has a free tier and paid plans; other platforms have
  their own pricing. Budget for it.
- **Naming a file `hello+api.web.ts`.** Platform extensions are not supported for API routes.
- **Putting a secret in `EXPO_PUBLIC_*`.** Those variables are inlined into the app bundle. Server
  secrets use plain environment variables read in the handler.
- **Trusting params and bodies.** Route params and request bodies are attacker-controlled, exactly
  like deep link params.
- **Calling `localhost` from a physical device.** That is the device. Use the dev server's LAN
  address or a tunnel.
- **Importing a native-binary package in a handler.** The server build cannot bundle it.

## Related topics

- [The app Directory](app-directory.md) — `+api.ts` and `+middleware.ts` among the filename conventions.
- [Dynamic and Catch-All Routes](dynamic-routes.md) — the same bracket syntax, used for endpoints.
- [Running on the Web](../expo-getting-started/running-on-web.md) — `web.output` and the web target.
- [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md) — why secrets belong behind an API route.
- [Expo Public Environment Variables](../expo-security/expo-public-env-vars.md) — what `EXPO_PUBLIC_` inlines.
- [Redirects and Auth-Gated Routes](redirects-and-auth.md) — client-side gating, and why the server must enforce auth too.
