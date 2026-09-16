---
title: OAuth with expo-auth-session and PKCE
description: Signing users in with the authorization code flow and PKCE using expo-auth-session ~57.0.12 — why the implicit flow and client secrets do not belong in a mobile app, and how to validate the redirect.
status: current
toolchain: expo
sdk: 57
---

An Expo app that signs users in through an identity provider (your own OAuth server, Auth0,
Okta, Keycloak, Google and so on) is an OAuth **public client**. It runs on hardware the user
controls, so it cannot hold a secret. The protocol has a specific answer for that situation:
the **authorization code flow with PKCE** (Proof Key for Code Exchange, RFC 7636).

`expo-auth-session` (SDK 57 resolves **`~57.0.12`**) implements that flow. It opens the provider's
login page in the system browser, receives the redirect back into your app, and gives you an
authorization code to exchange for tokens. PKCE is **on by default**.

## Why it exists / when to use it — and when NOT to

Use it when your app delegates sign-in to a standards-compliant OAuth 2.0 / OpenID Connect
provider and you want the user to type their password into the provider's page, not yours.

Do **not** use it:

- For a username/password form posting to your own API. That is not OAuth; it is a login
  endpoint. Store the resulting session token with
  [expo-secure-store](secure-store-vs-asyncstorage.md).
- To obtain a token that needs a client secret (the "confidential client" flows). The app
  cannot keep that secret — see [Security considerations](#security-considerations).
- As a replacement for a platform-native sign-in SDK where the provider requires one. Check the
  provider's own mobile guidance first.

## Basic example

```bash
npx expo install expo-auth-session expo-crypto expo-web-browser
```

`expo-auth-session` uses `expo-crypto` to generate the PKCE verifier and `expo-web-browser` to
open the login page.

Give the app a URL scheme so the provider can redirect back into it:

```json title=app.json
{
  "expo": {
    "scheme": "myapp"
  }
}
```

A complete sign-in screen, verified against the installed `expo-auth-session` 57.0.12 types:

```tsx title=app/sign-in.tsx
import {
  exchangeCodeAsync,
  makeRedirectUri,
  ResponseType,
  useAuthRequest,
  useAutoDiscovery,
} from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import {useEffect, useState} from 'react';
import {Button, Text, View} from 'react-native';

// On web this closes the login popup once the redirect lands. On native it is a no-op,
// so calling it unconditionally is safe.
WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = 'mobile-app'; // public by design — it identifies the app, it does not authenticate it
const redirectUri = makeRedirectUri({scheme: 'myapp', path: 'oauth'});

export default function SignIn() {
  const discovery = useAutoDiscovery('https://auth.example.com');
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: CLIENT_ID,
      redirectUri,
      scopes: ['openid', 'profile', 'offline_access'],
      responseType: ResponseType.Code, // the default; stated so nobody "simplifies" it to Token
      usePKCE: true, // also the default
    },
    discovery,
  );

  useEffect(() => {
    if (response?.type === 'error') {
      setError(response.error?.message ?? response.errorCode ?? 'sign-in failed');
      return;
    }
    if (response?.type !== 'success' || !discovery || !request?.codeVerifier) {
      return;
    }
    const code = response.params.code;
    const codeVerifier = request.codeVerifier;

    void (async () => {
      try {
        // The verifier proves this app is the one that started the flow. An app that
        // intercepted the redirect has the code but not the verifier, so it cannot redeem it.
        const tokens = await exchangeCodeAsync(
          {
            clientId: CLIENT_ID,
            code,
            redirectUri,
            extraParams: {code_verifier: codeVerifier},
          },
          discovery,
        );
        if (tokens.refreshToken) {
          await SecureStore.setItemAsync('auth.refresh_token', tokens.refreshToken, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'token exchange failed');
      }
    })();
  }, [response, discovery, request]);

  return (
    <View style={{padding: 24, gap: 12}}>
      <Button title="Sign in" disabled={!request} onPress={() => void promptAsync()} />
      {error ? <Text>{error}</Text> : null}
    </View>
  );
}
```

> [!NOTE] Expo Go vs development build
> `expo-auth-session`, `expo-crypto` and `expo-web-browser` are all in Expo Go, so the flow can run
> there. But Expo Go does not use **your** `scheme` — it has its own — so the redirect URI differs
> from the one your release build uses, and a provider configured with an exact redirect URI will
> reject one of them. Test sign-in on a
> [development build](../expo-development-builds/why-you-need-one.md), where the scheme is yours.

## How it works

### The authorization code flow with PKCE, step by step

```text
app                                  system browser / provider               token endpoint
 |  1. generate code_verifier (random)                                               |
 |     code_challenge = BASE64URL(SHA256(verifier))                                  |
 |  2. open /authorize?response_type=code                                            |
 |       &code_challenge=...&code_challenge_method=S256                              |
 |       &state=...&redirect_uri=myapp://oauth                                       |
 |--------------------------------------->|                                          |
 |                                        | user signs in                            |
 |  3. myapp://oauth?code=XYZ&state=...   |                                          |
 |<---------------------------------------|                                          |
 |  4. POST code=XYZ, code_verifier=...   --------------------------------------->   |
 |                                          provider checks SHA256(verifier)         |
 |                                          matches the challenge from step 2        |
 |  5. <----------------------- access token, refresh token ------------------------ |
```

What the installed types say about each piece:

| Piece | In `expo-auth-session` 57.0.12 |
| --- | --- |
| Response type | `ResponseType.Code` is the default (`ResponseType.Token` is the implicit flow) |
| PKCE | `usePKCE` defaults to `true` |
| Challenge method | `CodeChallengeMethod.S256` is the default; the types say never to use `Plain` |
| Verifier | Generated for you and exposed as `request.codeVerifier` |
| `state` | Generated for you if you do not pass one, and checked on the redirect |
| Client secret | `clientSecret` exists on the config type, documented as having "no secure way to store this on the client" |

### `state` is checked for you

When the redirect comes back, `AuthRequest` compares the returned `state` with the value it sent.
In the installed 57.0.12 source, a mismatch produces an error result with the code
`state_mismatch` rather than a success. Handle `response.type === 'error'` and you get that
protection without writing it yourself. Do not bypass it by parsing the redirect URL manually.

### Why the implicit flow is wrong on mobile

The implicit flow (`responseType: ResponseType.Token`) returns the **access token directly in the
redirect URL**. On the web that redirect goes to an origin the browser enforces. On a phone it goes
to a **custom URL scheme**, and a custom scheme is not owned by anyone:

- Any app on the device can register the same scheme (`myapp://`) in its own manifest or
  `Info.plist`.
- When two apps claim a scheme, which one receives the redirect is not something you control.
- With the implicit flow, whichever app receives the redirect **has the token**. It can call your
  API as the user immediately.

With the code flow and PKCE, the malicious app can still receive `myapp://oauth?code=XYZ`. But the
code is useless without the `code_verifier`, which never left your app's memory. The token endpoint
refuses to redeem the code without it. That is the entire purpose of PKCE.

Current OAuth guidance for native apps (RFC 8252, and the OAuth 2.0 Security Best Current
Practice) recommends against the implicit flow for this reason.

### Why a client secret cannot be kept in an app

`clientSecret` is on the config type, and some provider dashboards will happily issue you one. It
does not belong in an Expo app:

- Anything in the JavaScript bundle is readable. This site demonstrates recovering
  `EXPO_PUBLIC_` values straight out of the Hermes bytecode with `grep` — see
  [EXPO_PUBLIC_ Variables and the Leak They Cause](expo-public-env-vars.md) and the reproduced
  example in `examples/expo-public-leak/`.
- A secret shared by every install authenticates nothing: every user, and every attacker who
  downloads the app, has the same one.
- Putting it in an EAS `secret` environment variable does not help if the build inlines it — see
  [EAS Secrets and Build-Time Variables](eas-secrets.md).

Register the app with your provider as a **public client** (the name varies: "Native",
"Public", "SPA/Native", "no client secret"). If the provider only offers confidential clients for
the API you need, put the confidential part on your backend: your server exchanges the code with
its secret and hands the app a session of your own.

## Platform differences

:::tabs
@tab iOS
`promptAsync()` opens an authentication session through `expo-web-browser`, which uses the
system's web authentication session. The system shows a consent prompt naming the domain
before it opens — that prompt is iOS behaviour, not something your app controls.

A custom scheme must be registered in `Info.plist`; with Continuous Native Generation the
`scheme` key in `app.json` writes it for you at prebuild.
@tab Android
`promptAsync()` opens a Custom Tab in the user's default browser. The redirect returns through an
intent filter for your scheme, which `scheme` in `app.json` generates at prebuild.

Android has no system-level ownership of custom schemes, which is the concrete reason the
implicit flow is unsafe here.
:::

Both platforms need a **new native build** after you add or change `scheme`, because it is written
into native configuration. See [expo prebuild](../expo-core-concepts/prebuild.md).

## Common patterns

### Build the redirect URI once and register exactly that

`makeRedirectUri({scheme: 'myapp', path: 'oauth'})` produces `myapp://oauth` in a build that uses
your scheme. Log it once on each build type you ship and register **those exact strings** with the
provider:

```ts title=app/lib/redirect.ts
import {makeRedirectUri} from 'expo-auth-session';

// Log this from a development build and a release build, then register each exact value
// in the provider's allowed redirect URIs. No wildcards.
export const redirectUri = makeRedirectUri({scheme: 'myapp', path: 'oauth'});
```

### Refresh without prompting

Keep the refresh token in SecureStore and use `refreshAsync` when the access token expires:

```ts title=app/lib/refresh.ts
import {refreshAsync, type DiscoveryDocument} from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';

export async function refreshAccessToken(
  discovery: DiscoveryDocument,
): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync('auth.refresh_token');
  if (!refreshToken) {
    return null; // caller sends the user back to sign-in
  }
  try {
    const tokens = await refreshAsync({clientId: 'mobile-app', refreshToken}, discovery);
    if (tokens.refreshToken) {
      // Providers that rotate refresh tokens invalidate the old one; store the new one.
      await SecureStore.setItemAsync('auth.refresh_token', tokens.refreshToken, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }
    return tokens.accessToken;
  } catch {
    await SecureStore.deleteItemAsync('auth.refresh_token');
    return null;
  }
}
```

Keep the access token in memory rather than on disk where you can. It is short-lived; losing it on
a restart costs one refresh call.

## Security considerations

### Threat 1: redirect interception with the implicit flow

**Threat.** A malicious app on the same device registers your custom scheme and receives the OAuth
redirect.

**Exploit.** On Android, the attacker's app declares the same scheme in its manifest:

```xml title=AndroidManifest.xml (attacker's app)
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="myapp" />
</intent-filter>
```

If your app uses `responseType: ResponseType.Token`, the redirect the attacker receives is
`myapp://oauth#access_token=...` — a working token.

You can see what a redirect carries without a second app. Fire one at your own build with `adb`:

```bash
adb shell am start -W -a android.intent.action.VIEW -d "myapp://oauth?code=TEST&state=TEST"
```

Whatever your app would do with that URL, any app registered for the scheme could do too.

**Fix.** Use `ResponseType.Code` with `usePKCE: true` (both defaults). Never set
`CodeChallengeMethod.Plain`. Configure the provider to **require** PKCE for this client, so a
downgraded request is refused server-side, not just avoided client-side.

**Verification.**

1. Build the authorization URL and confirm it carries PKCE: log `request.url` after the request
   loads and check for `response_type=code`, `code_challenge=` and `code_challenge_method=S256`.
2. Prove the server enforces it: take a `code` from a successful sign-in in a test environment and
   try to redeem it **without** the verifier.

```bash
curl -s -X POST https://auth.example.com/oauth/token \
  -d grant_type=authorization_code \
  -d client_id=mobile-app \
  -d redirect_uri=myapp://oauth \
  -d code=THE_CODE_YOU_CAPTURED
```

A provider enforcing PKCE rejects this (typically `invalid_grant` or `invalid_request`). If it
returns tokens, PKCE is optional on the server and an intercepted code is redeemable — fix the
provider configuration.

### Threat 2: a client secret in the bundle

**Threat.** The app ships with a `clientSecret`, and an attacker uses it to impersonate your app
to the provider — for flows that trust the secret, that can mean obtaining tokens without a user.

**Exploit.**

```bash
npx expo export --platform android
grep -r -a -c "YOUR_CLIENT_SECRET_VALUE" dist/
```

A non-zero count means the secret is in the shipped bytecode.

**Fix.** Delete `clientSecret` from the app, register a public client, and rotate the secret at the
provider — it has already shipped. If the secret is genuinely needed, move the token exchange to
your backend.

**Verification.** Re-run the export and `grep`; expect `0`. Confirm at the provider that the old
secret is revoked, not merely replaced.

### Threat 3: loose redirect URI validation at the provider

**Threat.** The provider accepts any redirect URI matching a wildcard or prefix
(`myapp://*`, `https://example.com/*`). An attacker crafts an authorization link that sends the
code somewhere they control, or to a path in your app that forwards it.

**Fix.** Register **exact** redirect URIs, one per build type, with no wildcards. Keep the OAuth
redirect route in your app doing nothing except completing the auth session — never let it forward
query parameters elsewhere. See [Deep Link Validation](deep-link-validation.md).

**Verification.** Open an authorization URL with a modified `redirect_uri` in a desktop browser:

```text
https://auth.example.com/authorize?response_type=code&client_id=mobile-app&redirect_uri=myapp%3A%2F%2Fevil&code_challenge=abc&code_challenge_method=S256&state=x
```

The provider must show an error page, not a login form. If it shows a login form, its redirect
validation is too loose.

## Common mistakes

- **Switching to `ResponseType.Token` "because the code exchange is extra work".** The token then
  travels in a redirect any app can register for. Wrong: `responseType: ResponseType.Token`. Right:
  `ResponseType.Code` with `usePKCE: true` and `exchangeCodeAsync`.
- **Forgetting `code_verifier` in the exchange.** A provider enforcing PKCE rejects the exchange.
  Pass `extraParams: {code_verifier: request.codeVerifier}`.
- **Shipping `clientSecret`.** It is in the bundle. Register a public client.
- **Registering a wildcard redirect URI.** Register exact URIs only.
- **Testing only in Expo Go.** Expo Go's redirect URI differs from your build's, so a provider
  configured for your real URI rejects it, or vice versa. Test on a development build.
- **Storing tokens in AsyncStorage.** It is unencrypted. Refresh tokens go in
  [expo-secure-store](secure-store-vs-asyncstorage.md).
- **Parsing the redirect URL yourself and skipping the `state` check.** `expo-auth-session` already
  checks `state` and reports `state_mismatch`. Handle the `error` result instead of bypassing it.
- **Installing with a bare package-manager install.** Use `npx expo install` so you get the
  `~57.0.12` build that matches SDK 57.

## Related topics

- [Authentication and OAuth](../expo-sdk/authentication.md) — the wider `expo-auth-session` API and provider helpers.
- [expo-secure-store vs AsyncStorage](secure-store-vs-asyncstorage.md) — where the refresh token goes.
- [EXPO_PUBLIC_ Variables and the Leak They Cause](expo-public-env-vars.md) — why a client secret cannot live in the app.
- [What Ships Inside the Bundle](what-ships-in-the-bundle.md) — everything else an attacker can read.
- [Deep Link Validation](deep-link-validation.md) — keeping the redirect route from becoming an open redirect.
- [Deep Links and Universal Links](../expo-router/deep-linking.md) — schemes, universal links and app links.
- [Linking](../expo-sdk/linking.md) — `scheme` and `expo-linking`.
