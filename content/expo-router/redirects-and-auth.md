---
title: Redirects and Auth-Gated Routes
description: Keeping signed-out users out of signed-in routes in Expo Router 57 — Stack.Protected as the recommended mechanism, the Redirect component, why the gate belongs in a layout, loading the session behind the splash screen, and what client-side gating does not protect.
status: current
toolchain: expo
sdk: 57
---

An auth-gated app has two route trees — one for signed-out users and one for signed-in users — and
a rule that decides which one is reachable. Expo Router 57 gives you two mechanisms for the rule:

| Mechanism | What it does | Use for |
| --- | --- | --- |
| **`Stack.Protected`** (and `Tabs.Protected`, `Drawer.Protected`) | removes screens from the navigator while a `guard` is `false` | **the auth gate** — recommended |
| **`<Redirect href>`** | navigates as soon as it renders | one-off redirects, and projects still on the older pattern |

Both are verified in the installed `expo-router` 57.0.21 types: `Protected` takes
`{guard: boolean; children?: ReactNode}` and is attached to `Stack`, `Tabs`, `Drawer`, the JS stack,
top tabs and any navigator built with `withLayoutContext`; `Redirect` takes `href`,
`relativeToDirectory` and `withAnchor`. The Expo authentication guide for current SDKs uses
`Stack.Protected`, and keeps the redirect-based version as the guide for SDK 52 and earlier.

> [!DANGER] This is navigation, not security
> Protected routes and redirects run **in the app**. They decide what the user is shown; they do
> not stop anyone reading data. Anything a signed-out user must not see has to be refused by your
> **server**, on every request, based on a credential it verifies. The Expo documentation says the
> same: protected screens are evaluated on the client only.

## Why it exists / when to use it — and when NOT to

Without a gate, a signed-out user can reach a signed-in screen three ways: through a stale
`router.push`, through the back button after signing out, and through a deep link. The gate has to
close all three, at every screen in the tree, including screens added next year.

**Put the gate in a layout, not in the screens.** A layout wraps every route below it, so one check
covers the whole subtree:

| | Check in each screen | Check in the layout |
| --- | --- | --- |
| New screens | unprotected until someone remembers | protected by default |
| Deep link to a nested route | the screen mounts, renders, then redirects | never registered, or redirected before children render |
| Flash of protected content | yes — first render happens before the redirect | no |
| Back after sign-out | the screen is still in history | the screen is removed from the navigator |

Do not reach for a gate for **authorisation within** the signed-in area — "admins can see this
tab" is also a guard, but the data behind it still needs a server-side check. And do not gate
routes that are genuinely public, such as a privacy policy linked from the sign-in screen.

## Basic example

```text
src/app/
├── _layout.tsx          # Stack with Stack.Protected — the gate
├── sign-in.tsx          # "/sign-in" — only while signed out
└── (app)/
    ├── _layout.tsx      # signed-in chrome
    ├── index.tsx        # "/"
    └── settings.tsx     # "/settings"
```

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';
import {createContext, useContext, useMemo, useState, type ReactNode} from 'react';

type Auth = {session: string | null; signIn: (token: string) => void; signOut: () => void};

const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

function AuthProvider({children}: {children: ReactNode}) {
  const [session, setSession] = useState<string | null>(null);
  const value = useMemo<Auth>(
    () => ({session, signIn: setSession, signOut: () => setSession(null)}),
    [session],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function RootNavigator() {
  const {session} = useAuth();

  return (
    <Stack screenOptions={{headerShown: false}}>
      {/* Registered only while signed in. */}
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      {/* Registered only while signed out. */}
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
```

The navigator is split into `RootNavigator` because `useAuth()` must run **inside** the provider.
Calling it in `RootLayout` itself would read the context from above the provider and get `null`.

## How it works

### A failing guard unregisters the screens

When `guard` is `false`, the screens inside `Stack.Protected` are not part of the navigator at all.
They cannot be pushed, replaced into, or reached by URL. A deep link to `/settings` while signed
out does not render `settings.tsx` and then bounce; the route is not available, so the router
resolves to what is.

### Flipping the guard redirects and clears history

When a guard changes from `true` to `false` — the user signs out — the Expo documentation describes
two effects: the user is moved to the navigator's anchor route or first available screen, and the
protected screens' history entries are removed. So back after sign-out cannot return to
`/settings`, because `/settings` is no longer in the stack.

Signing in flips the other guard. `sign-in` is unregistered, and `(app)` becomes available:

```tsx-fragment title=src/app/sign-in.tsx
// Fragment: imports useAuth from another file, so it cannot be type-checked on its own.
import {router} from 'expo-router';
import {Button, View} from 'react-native';
import {useAuth} from '@/hooks/use-auth';

export default function SignIn() {
  const {signIn} = useAuth();

  async function onSubmit() {
    const token = 'token-from-your-server';
    signIn(token);
    // replace, not push: the sign-in screen should not be in history.
    router.replace('/');
  }

  return (
    <View>
      <Button title="Sign in" onPress={onSubmit} />
    </View>
  );
}
```

> [!NOTE] Keep `useAuth` outside `app/`
> The basic example defines the provider inside `_layout.tsx` to keep it on one screen. In a real
> project, move `AuthProvider` and `useAuth` to `src/hooks/use-auth.tsx` — outside `app/`, so it is
> not treated as a route file — and import it with the `@/*` alias, as the sign-in screen does.

### Two groups, one URL

Both trees may have a screen at `/`. Normally that is a collision (see [Groups](groups.md)), but
with `Stack.Protected` only one tree is registered at a time, so only one route answers `/`.

### Guards nest

A guard inside a protected subtree narrows access further:

```tsx title=src/app/(app)/_layout.tsx
import {Stack} from 'expo-router';
import {useState} from 'react';

export default function AppLayout() {
  // Replace with the role from your session; the server must enforce it too.
  const [isAdmin] = useState(false);

  return (
    <Stack>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Protected guard={isAdmin}>
        <Stack.Screen name="admin" />
      </Stack.Protected>
    </Stack>
  );
}
```

### Loading the session without a flash

The session usually comes from storage, which is asynchronous. If the guard evaluates before it
loads, a signed-in user sees the sign-in screen for a moment. Keep the splash screen up until the
session is known:

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import {useEffect, useState} from 'react';

// Called at module scope so the splash stays up from the first frame.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [session, setSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync('session')
      .then(setSession)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Render nothing until the guard's input is known.
  if (loading) return null;

  return (
    <Stack screenOptions={{headerShown: false}}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
```

`expo-secure-store` stores the token in the iOS Keychain and Android Keystore-backed storage, which
is where a session token belongs — see
[Secure Store vs AsyncStorage](../expo-security/secure-store-vs-asyncstorage.md). On web it is not
available; the Expo guide falls back to `localStorage` there, with the weaker guarantees that
implies.

### The older pattern: `Redirect` in a layout

Before protected routes, the documented gate was a layout that rendered `<Redirect>`. It still
works, and you will meet it in existing projects:

```tsx title=src/app/(app)/_layout.tsx
import {Redirect, Stack} from 'expo-router';
import {useState} from 'react';

export default function AppLayout() {
  const [session] = useState<string | null>(null);

  // Runs before any child screen renders, so no protected content flashes.
  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  return <Stack />;
}
```

It is still a layout-level check, so it keeps the advantages in the table above. What it lacks is
the history cleanup: the routes stay registered, so correctness depends on every path through the
app hitting the layout. Prefer `Stack.Protected` for new code.

## Platform differences

The gating logic is identical on iOS, Android and web. What differs is the surrounding risk:

| | Native | Web |
| --- | --- | --- |
| Deep link to a protected route | resolved against the current guard | same, from the address bar |
| Static rendering | not applicable | `web.output: 'static'` pre-renders HTML at build time — a protected screen's markup is in the output, so never render private data during static rendering |
| Token storage | Keychain / Keystore via `expo-secure-store` | `localStorage` or cookies; readable by any script on the origin |

## Common patterns

### Static redirects for moved URLs

For a URL that has permanently moved — not an auth decision — the `expo-router` config plugin
accepts a `redirects` array of `{source, destination, permanent?, methods?}`. `permanent` defaults
to `false`, and omitting `methods` redirects every HTTP method:

```json title=app.json
{
  "expo": {
    "plugins": [
      ["expo-router", {"redirects": [{"source": "/blog/[slug]", "destination": "/posts/[slug]", "permanent": true}]}]
    ]
  }
}
```

### A one-off redirect from a screen

`<Redirect>` is the right tool when a single screen should forward somewhere — an index route that
only picks a default tab, for example:

```tsx title=src/app/(app)/index.tsx
import {Redirect} from 'expo-router';

export default function Index() {
  return <Redirect href="/feed" />;
}
```

## Security considerations

**Threat.** An attacker who does not have a session wants protected data. They do not need your
app's UI to get it: they can call your API directly, or modify a copy of the app so every guard is
`true`.

**Exploit.** `guard={true}` is one edit to the JavaScript bundle of a rebuilt app, and your API is
reachable with `curl`. If the API returns data whenever it is asked, the gate protected nothing:

```bash
curl https://api.example.com/me/settings
```

**Fix.** Every endpoint that returns private data verifies a credential server-side and rejects the
request without one. The in-app guard is a user-experience feature layered on top:

```bash
# Expected: 401 without a token, 200 only with a valid one.
curl -i https://api.example.com/me/settings
curl -i -H "Authorization: Bearer $TOKEN" https://api.example.com/me/settings
```

**Verification.** Sign out, confirm the app shows the sign-in screen, then run the first `curl`
above. It must return `401`. Also fire a deep link at a protected route while signed out and
confirm the protected screen never renders:

```bash
adb shell am start -a android.intent.action.VIEW -d "router://settings"
xcrun simctl openurl booted "router://settings"
```

## Common mistakes

- **Checking auth in each screen.** New screens are unprotected by default and protected content
  renders before the redirect. Gate in the layout.
- **Calling the auth hook in the same component that renders the provider.** The hook reads the
  context from above the provider and gets nothing. Split the navigator into a child component.
- **Evaluating the guard before the session loads.** Signed-in users see the sign-in screen
  briefly. Keep the splash up and render nothing until the session is known.
- **Using `push` after sign-in.** The sign-in screen stays in history. Use `replace`.
- **Treating `Stack.Protected` as access control.** It controls navigation. The server must refuse
  requests without a valid credential.
- **Putting the auth provider file inside `app/`** without it being a layout. Any non-layout file
  in `app/` is a route.
- **Storing the session token in AsyncStorage.** It is unencrypted. Use `expo-secure-store` on
  native.
- **Rendering private data during static web rendering.** With `web.output: 'static'` it is written
  into the exported HTML.

## Related topics

- [Layouts](layouts.md) — why a gate in `_layout.tsx` covers the whole subtree.
- [Groups](groups.md) — the `(app)` group and why two trees can both have `/`.
- [Stack](stack.md) — `Stack.Protected` alongside the other stack APIs.
- [Deep Links and Universal Links](deep-linking.md) — the path by which users reach protected routes directly.
- [Secure Store vs AsyncStorage](../expo-security/secure-store-vs-asyncstorage.md) — where the session token belongs.
- [API Routes](api-routes.md) — enforcing auth on the server side.
