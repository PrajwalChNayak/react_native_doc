# Example: expo-deep-link-pair

A **vulnerable/fixed pair** for deep link handling, with tests that prove the vulnerability is
real and that the fix closes it.

> **Toolchain:** Expo SDK 57 · React Native **0.86.3** · expo-linking ~57.0.10 · runs in **Expo Go**

## The vulnerability

Every part of a deep link is **attacker-controlled**. Anyone can put
`expodeeplink://login?next=...` in a web page, a QR code or a chat message.
`src/vulnerable.ts` does what most redirect-after-login code does: it reads `next` and goes
there. That lets a stranger:

- send the user to an attacker-chosen website from inside your trusted app (an **open
  redirect**, the standard phishing primitive);
- open internal screens that were never meant to be linkable, such as
  `/admin/delete-account`;
- navigate using links from origins you never verified.

## The fix

`src/fixed.ts` applies three rules:

1. **Only accept origins you own.** That means the custom scheme or your verified https host;
   everything else is ignored.
2. **Only navigate to allow-listed paths.** The list is short on purpose.
3. **Never open an external URL because a link asked you to.** A disallowed `next` falls back
   to home rather than failing open.

## The proof

`__tests__/exploits.test.ts` asserts that the vulnerable handler *does* the dangerous thing.
That assertion is what makes the claim demonstrable rather than a warning. It also asserts
the fixed handler doesn't:

| Crafted link | Vulnerable | Fixed |
| --- | --- | --- |
| `expodeeplink://login?next=https://evil.example/phish` | opens evil.example | navigates to `/` |
| `expodeeplink://login?next=//evil.example` | navigates to `//evil.example` | `/` |
| `expodeeplink://?next=/admin/delete-account` | opens the admin screen | `/` |
| `expodeeplink://posts/%2E%2E%2Fadmin` (decodes to `/posts/../admin`) | navigates to it | `/` |
| `https://evil.example/posts/1` | accepts it | ignored |
| `expodeeplink://posts/%E0%A4%A` (broken encoding) | ignored | ignored |

Legitimate links still work in the fixed handler. The tests check `expodeeplink://posts/42`,
`https://example.com/settings` and an encoded `next=%2Fsettings`.

### Why the parser is hand-written

`src/parse.ts` does not use the global `URL`. React Native's URL polyfill handles custom
schemes differently from Node's, so logic tested in Jest against `new URL()` can behave
differently on a device. A small deterministic parser behaves the same in both, and that is
what makes these tests trustworthy.

## Run it

```bash
npm install
```

```bash
npm test
```

To see both decisions on a device, start the app and open it from a link:

```bash
npx expo start
```

```bash
npx uri-scheme open "expodeeplink://login?next=https://evil.example" --android
```

The screen shows what each handler *would* do; nothing actually navigates. This runs in **Expo
Go**. Note that a link opened in Expo Go arrives in Expo Go's own URL format rather than
`expodeeplink://`, so use a development build to exercise the custom scheme exactly.

## Verify

Every result below was produced on this project on Windows with Node 22.13.0:

| Check | Result |
| --- | --- |
| `npm run tsc` | exit 0 |
| `npm test` | **16 passed**, 1 suite |
| `npm run check-deps` | `Dependencies are up to date` |
| `npm run config:public` | resolves; `sdkVersion: 57.0.0`, `scheme: expodeeplink` |
| `npm run export` | **590 modules** → `index-*.hbc` **1.5 MB** |

## Related reading

- [Deep Link Validation](../../content/expo-security/deep-link-validation.md)
- [Deep Links and Universal Links](../../content/expo-router/deep-linking.md)
- [Linking](../../content/expo-sdk/linking.md)
