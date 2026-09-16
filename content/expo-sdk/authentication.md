---
title: Authentication and OAuth
description: Signing users in with expo-auth-session in Expo SDK 57 — the authorization code flow with PKCE, redirect URIs, why the implicit flow and client secrets do not belong in a mobile app, and where tokens go afterwards.
status: current
toolchain: expo
sdk: 57
---

`expo-auth-session` implements OAuth 2.0 and OpenID Connect sign-in for an Expo app. It builds the
authorization request, generates the PKCE verifier and challenge, opens the provider's login page in a
secure system browser session (through `expo-web-browser`), and hands the redirect back to your code.

```bash
npx expo install expo-auth-session expo-crypto expo-web-browser
```

That resolves `expo-auth-session@~57.0.12`, `expo-crypto@~57.0.3` (used for PKCE) and
`expo-web-browser@~57.0.3` on SDK 57. See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

## Why it exists / when to use it — and when NOT to

Use it to sign in with an identity provider that speaks OAuth 2.0 / OpenID Connect: Google, Microsoft
Entra ID, Okta, Auth0, Keycloak, Cognito, or your own authorization server.

Do **not** use it:

- **To collect a username and password in your own UI** and post them to a provider. That defeats the
  point of OAuth — the user's password should only ever be typed on the provider's page.
- **With the implicit flow** (`ResponseType.Token`). It is still in the API for legacy code; the Expo
  documentation recommends moving away from it. See below.
- **As a place to keep a client secret.** There is no such place in a mobile app.
- **For "Sign in with Apple" native UI.** That is a separate native API (`expo-apple-authentication`), not
  covered here.

## Expo Go vs development build

**Use a development build.** The package itself is included in Expo Go, but Expo's authentication guide
states that Expo Go cannot be used for local development and testing of OAuth or OpenID Connect apps,
because you cannot customise Expo Go's URL scheme. In Expo Go, redirect URIs use Expo Go's `exp://`
scheme, which you cannot register with a provider as belonging to your app.

A [development build](../expo-development-builds/why-you-need-one.md) carries your own `scheme`, so the
redirect URI you register with the provider is the one the app really receives.

## Basic example

Authorization code with PKCE, exchanging the code on your server:

```tsx title=app/sign-in.tsx
import {
  makeRedirectUri,
  ResponseType,
  useAuthRequest,
  useAutoDiscovery,
} from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {useEffect} from 'react';
import {Button} from 'react-native';

// Completes the auth popup on web. Harmless on native; call it at module scope.
WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = 'my-mobile-app'; // public identifier, not a secret

export default function SignIn({onCode}: {onCode: (code: string, verifier: string, redirectUri: string) => void}) {
  const discovery = useAutoDiscovery('https://auth.example.com/realms/main');
  const redirectUri = makeRedirectUri({scheme: 'myapp', path: 'oauth/callback'});

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: CLIENT_ID,
      redirectUri,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      responseType: ResponseType.Code,
      // usePKCE defaults to true. Stated explicitly so nobody turns it off.
      usePKCE: true,
    },
    discovery,
  );

  useEffect(() => {
    if (response?.type === 'success' && request?.codeVerifier) {
      // expo-auth-session already checked that `state` matches the request.
      onCode(response.params.code, request.codeVerifier, redirectUri);
    }
  }, [response, request, redirectUri, onCode]);

  return <Button title="Sign in" disabled={!request} onPress={() => promptAsync()} />;
}
```

## How it works

### The flow, step by step

1. `useAuthRequest` builds an `AuthRequest`: a random `state`, a random PKCE `codeVerifier`, and its SHA-256
   `codeChallenge`.
2. `promptAsync()` opens the provider's authorization URL (with `code_challenge` and
   `code_challenge_method=S256`) in an authentication session — `ASWebAuthenticationSession` on iOS, a
   Custom Tab on Android. The user signs in **on the provider's page**.
3. The provider redirects to your `redirectUri` with `?code=…&state=…`. The OS routes that URL back to the
   waiting session.
4. `expo-auth-session` verifies `state` and resolves `response` with `type: 'success'` and `params.code`.
5. You exchange the `code` **plus the `codeVerifier`** for tokens at the token endpoint. Without the
   verifier the code is useless — that is what PKCE adds.

### `useAuthRequest`

`useAuthRequest(config, discovery)` returns `[request, response, promptAsync]`:

| Item | Type | Notes |
| --- | --- | --- |
| `request` | `AuthRequest \| null` | `null` until discovery has loaded. Disable your button until it exists. |
| `response` | `AuthSessionResult \| null` | `null` until the prompt finishes. |
| `promptAsync` | `(options?) => Promise<AuthSessionResult>` | Must be called from a user gesture. |

`AuthSessionResult.type` is `'success'` or `'error'` (with `params`, `errorCode`, `error`, `url`), or
`'cancel'`, `'dismiss'`, `'opened'` or `'locked'` when the user backed out or another session was running.

| `AuthRequestConfig` | Meaning |
| --- | --- |
| `clientId` | The public client ID registered with the provider. |
| `redirectUri` | Must exactly match a URI registered with the provider. |
| `scopes` | Requested scopes. |
| `responseType` | `ResponseType.Code` (use this), `Token` or `IdToken`. |
| `usePKCE` | Default `true`. |
| `codeChallengeMethod` | `CodeChallengeMethod.S256` (default) or `Plain`. Never use `Plain`. |
| `state` | Generated for you if omitted. |
| `prompt` | e.g. `Prompt.Login` to force re-authentication. |
| `extraParams` | Provider-specific query parameters. |
| `clientSecret` | Exists in the type. **Do not set it in a mobile app.** |

### Discovery

`useAutoDiscovery(issuer)` fetches the provider's `/.well-known/openid-configuration` and returns a
`DiscoveryDocument` (`authorizationEndpoint`, `tokenEndpoint`, `revocationEndpoint`, `userInfoEndpoint`,
…) or `null` while loading. For a provider without discovery, pass a hand-written object with the
endpoints instead.

### Redirect URIs

`makeRedirectUri({scheme?, path?, queryParams?, native?, preferLocalhost?, isTripleSlashed?})` builds the
URI for the current environment. In a development or release build with `"scheme": "myapp"` in the app
config, `makeRedirectUri({scheme: 'myapp', path: 'oauth/callback'})` produces
`myapp://oauth/callback`. On web it derives the URI from `window.location`.

The same string must be **registered with the provider** and **sent in the token exchange**. A mismatch in
any character — a trailing slash, `://` versus `:///` — fails with `redirect_uri_mismatch`.

### Exchanging the code

The recommended place is **your server**, which then issues your own session. If your provider supports
public clients and you have no backend, the app can exchange the code directly with PKCE:

```ts title=lib/exchange.ts
import {exchangeCodeAsync, type DiscoveryDocument, type TokenResponse} from 'expo-auth-session';

export async function exchangeInApp(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  discovery: DiscoveryDocument,
): Promise<TokenResponse> {
  return exchangeCodeAsync(
    {
      clientId: 'my-mobile-app',
      code,
      redirectUri,
      // The verifier proves this app started the flow. No client secret.
      extraParams: {code_verifier: codeVerifier},
    },
    discovery,
  );
}
```

A `TokenResponse` has `accessToken`, `refreshToken?`, `idToken?`, `expiresIn?`, `issuedAt`, `scope?`, and
the helpers `shouldRefresh()` and `refreshAsync(config, discovery)`. `refreshAsync(config, discovery)` and
`revokeAsync(config, discovery)` are also exported as functions.

## Native configuration

`expo-auth-session` has no config plugin and needs no usage strings or permissions. What it needs is a
**URL scheme** so the redirect can reach your app.

:::tabs
@tab iOS

```json title=app.json
{
  "expo": {
    "scheme": "myapp",
    "ios": {
      "bundleIdentifier": "com.example.myapp"
    }
  }
}
```

`scheme` registers `myapp://` in `CFBundleURLTypes` in the generated `Info.plist`. The authentication
session receives the redirect directly, so no additional `Info.plist` entry is required for the OAuth
callback.

@tab Android

```json title=app.json
{
  "expo": {
    "scheme": "myapp",
    "android": {
      "package": "com.example.myapp"
    }
  }
}
```

`scheme` adds an intent filter for `myapp://` to the main activity. No permission is needed.

`expo-web-browser`'s optional config plugin option `experimentalLauncherActivity` adds a
`BrowserLauncherActivity` that changes how the app is relaunched from the launcher while a Custom Tab is
open. It is experimental; leave it off unless you have that specific problem.
:::

Changing `scheme` changes native code — rebuild the development build afterwards.

## Platform differences

| Concern | iOS | Android | Web |
| --- | --- | --- | --- |
| Browser | `ASWebAuthenticationSession` | Custom Tabs | Popup window |
| Redirect delivery | Directly to the session | Via the scheme's intent filter | Requires `WebBrowser.maybeCompleteAuthSession()` |
| Shared browser cookies | Session may share Safari's cookies; iOS may show a consent alert | Shares the default browser's session | Browser session |
| `makeRedirectUri` | From `scheme` | From `scheme` | From `window.location` |

## Common patterns

### Store tokens, then refresh

After the exchange, put the refresh token in [`expo-secure-store`](secure-store.md) and keep the access
token in memory. Refresh before use:

```ts title=lib/session.ts
import {refreshAsync, type DiscoveryDocument, TokenResponse} from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';

let current: TokenResponse | null = null;

export async function saveTokens(tokens: TokenResponse): Promise<void> {
  current = tokens;
  if (tokens.refreshToken) {
    await SecureStore.setItemAsync('refresh_token', tokens.refreshToken, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  }
}

export async function getAccessToken(discovery: DiscoveryDocument): Promise<string | null> {
  if (current && !current.shouldRefresh()) {
    return current.accessToken;
  }
  const refreshToken = current?.refreshToken ?? (await SecureStore.getItemAsync('refresh_token'));
  if (!refreshToken) {
    return null; // sign in again
  }
  const next = await refreshAsync({clientId: 'my-mobile-app', refreshToken}, discovery);
  await saveTokens(next);
  return next.accessToken;
}
```

### Signing out

Revoke the refresh token at the provider (`revokeAsync`) where supported, delete it from secure storage,
and clear the in-memory access token. Deleting the local copy alone leaves a valid refresh token alive on
the server.

## Security considerations

The full threat model, including redirect interception and token storage, is in
[OAuth with expo-auth-session and PKCE](../expo-security/oauth-and-pkce.md). The four rules that matter on
this page:

### 1. Use the authorization code flow with PKCE

**Threat.** A custom URL scheme such as `myapp://` is not owned by anyone. Another app on the device can
register the same scheme and receive your redirect.

**Exploit.** Without PKCE, the intercepted `?code=…` is enough: the malicious app posts it to the token
endpoint and receives the user's tokens.

**Fix.** PKCE binds the code to a secret verifier that never leaves your app's memory. An intercepted code
without the verifier is rejected by the token endpoint. `usePKCE` defaults to `true` with `S256`; keep both.

**Verification.** Complete a sign-in, capture the `code` from the redirect (log `response.params.code` in a
debug build), and call the token endpoint without `code_verifier`:

```bash
curl -X POST https://auth.example.com/realms/main/protocol/openid-connect/token \
  -d grant_type=authorization_code -d client_id=my-mobile-app \
  -d redirect_uri=myapp://oauth/callback -d code=CAPTURED_CODE
```

A correctly configured provider responds with `invalid_grant` (or a PKCE-specific error). If it returns
tokens, PKCE is not enforced for that client — turn on "require PKCE" in the provider's client settings.

### 2. Do not use the implicit flow

The implicit flow (`ResponseType.Token`) returns the access token **in the redirect URL itself**. On mobile
that URL travels through a custom scheme any app can claim, and can land in logs and browser history. There
is no verifier and usually no refresh token, so apps compensate with long-lived access tokens. The OAuth
Security Best Current Practice deprecates it. Use `ResponseType.Code` with PKCE.

### 3. No client secret in the app

**Threat.** Anything in the JS bundle or native binary is readable.

**Exploit.**

```bash
unzip -o app-release.apk -d apk
strings apk/assets/index.android.bundle | grep -i -E "client_?secret"
```

A `clientSecret` passed to `useAuthRequest` or `exchangeCodeAsync` — or an `EXPO_PUBLIC_` variable holding
one — shows up in that output. (On Hermes builds the bundle is bytecode, but string literals remain
extractable.) See [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md).

**Fix.** Register the app as a **public client** (no secret) and rely on PKCE. If the provider only offers
confidential clients, exchange the code on your server, which holds the secret. Never set `clientSecret` in
app code.

**Verification.** Re-run the `strings` command on your release build; it must print nothing.

### 4. Register exact redirect URIs

**Threat.** A provider configured with a wildcard or overly broad redirect URI lets an attacker craft an
authorization link that sends the code to a URI they control.

**Fix.** Register only the exact URIs your app uses — for example `myapp://oauth/callback` — and no
wildcards, no `http://` URIs except `localhost` for web development. Use a scheme unlikely to collide, such
as your reverse domain (`com.example.myapp://`).

**Verification.** Edit an authorization URL by hand to use `redirect_uri=https://evil.example/cb` and open
it. The provider must refuse with a redirect-URI error before showing a login page.

## Common mistakes

- **Testing sign-in in Expo Go.** You cannot register Expo Go's scheme with a provider. Use a development
  build.
- **Using `ResponseType.Token`.** That is the implicit flow. Use `ResponseType.Code` with PKCE.
- **Putting `clientSecret` in the app.** It is extractable from the bundle. Use a public client or a server
  exchange.
- **Exchanging the code without `code_verifier`.** The provider rejects it — or, worse, does not enforce
  PKCE and accepts it.
- **A redirect URI that differs between the request, the exchange and the provider registration.**
  Generate it once with `makeRedirectUri` and reuse the same string.
- **Calling `promptAsync` before `request` is ready.** Disable the button while `request` is `null`.
- **Storing tokens in AsyncStorage.** Refresh tokens belong in `expo-secure-store`.
- **Signing out by deleting the local token only.** Revoke it at the provider too.
- **Ignoring `'cancel'` and `'dismiss'` results.** Users back out; handle it without an error screen.

## Related topics

- [OAuth with expo-auth-session and PKCE](../expo-security/oauth-and-pkce.md) — the full threat model and verification steps.
- [Secure Store](secure-store.md) — where refresh tokens go.
- [Biometrics](biometrics.md) — gating an existing session behind Face ID or fingerprint.
- [Linking](linking.md) — URL schemes and how redirects reach the app.
- [Redirects and Auth-Gated Routes](../expo-router/redirects-and-auth.md) — protecting screens after sign-in.
- [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md) — why a client secret cannot hide in the app.
- [EXPO_PUBLIC_ Variables and the Leak They Cause](../expo-security/expo-public-env-vars.md) — the most common way secrets end up in the bundle.
