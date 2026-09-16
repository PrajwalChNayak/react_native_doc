# Example: expo-router-app

File-based routing with **Expo Router**: tabs inside a stack, a dynamic route, a modal, typed
routes, a not-found route and deep linking.

> **Toolchain:** Expo SDK 57 · React Native **0.86.3** · expo-router **57.0.21** · runs in **Expo Go**

## Routes

```text
src/app/
├── _layout.tsx          Stack: (tabs), posts/[id], modal
├── (tabs)/
│   ├── _layout.tsx      Tabs: index, settings
│   ├── index.tsx        /            posts list
│   └── settings.tsx     /settings    shows a deep link to post 2
├── posts/
│   └── [id].tsx         /posts/:id   dynamic route
├── modal.tsx            /modal       presented modally
└── +not-found.tsx       anything else
```

- `(tabs)` is a **group**. The parentheses keep it out of the URL: the posts list is `/`, not
  `/(tabs)`.
- Routes live in `src/app/`. That matches what `create-expo-app` generates for SDK 57.
- `package.json` sets `"main": "expo-router/entry"`. There is no `index.ts`.

## Typed routes

`app.json` enables them:

```json
"experiments": { "typedRoutes": true }
```

The route types are generated into `.expo/types/` when the dev server runs.
`tsconfig.json` includes that folder and `expo-env.d.ts`, and that include is what makes a
misspelled `href` a compile error. On a fresh clone that has never run `expo start`, the types
don't exist yet, so `href` is loosely typed until the first start.

## Deep links, and why the `[id]` route validates its input

`app.json` sets `"scheme": "exporouterexample"`, so this opens post 3:

```bash
npx uri-scheme open exporouterexample://posts/3 --android
```

Anyone can publish that link, so **a route param is attacker-controlled input**.
`src/lib/posts.ts` accepts `id` only if it is exactly one positive integer string. It rejects
the array a repeated query key produces, and anything like `../admin`. An unknown or malformed
id renders a not-found state and is never used for a lookup.

The full vulnerable-vs-fixed treatment of deep link handling is in
[expo-deep-link-pair](../expo-deep-link-pair/README.md).

## Run it

```bash
npm install
```

```bash
npx expo start
```

Press **a** for Android or **w** for web, or scan the QR code with **Expo Go**. **i** needs
**macOS with Xcode**.

This example runs in **Expo Go**. Every native module it uses (expo-router, screens,
safe-area-context, expo-linking) is part of the SDK 57 set Expo Go ships. Note that inside
Expo Go, `Linking.createURL` returns an Expo Go URL rather than `exporouterexample://`; the
settings tab shows whichever applies.

## Verify

Every result below was produced on this project on Windows with Node 22.13.0:

| Check | Result |
| --- | --- |
| `npm run tsc` | exit 0 |
| `npm test` | **6 passed**, 1 suite |
| `npm run check-deps` (`expo install --check`) | `Dependencies are up to date` |
| `npm run config:public` | resolves; `sdkVersion: 57.0.0`, `scheme: exporouterexample`, plugins `["expo-router"]` |
| `npm run export` | **1,202 modules** → `entry-*.hbc` **2.6 MB** |

### A test-setup trap this example hit

`npx expo install jest-expo jest @types/jest` is not enough on SDK 57. jest-expo 57.0.5
declares a peer dependency on `@react-native/jest-preset@^0.86.3`, and without it every
run fails with:

```text
● Validation Error:
  An unknown error occurred in jest-expo:
  The React Native Jest preset that jest-expo relies on has moved to a separate package.
To migrate, please install "@react-native/jest-preset" to fulfill jest-expo's peer dependency.
```

`package.json` therefore pins `@react-native/jest-preset` at **0.86.3**, which matches SDK
57's React Native. Using 0.87 would mean the CLI half's version.

## Related reading

- [Expo Router Fundamentals](../../content/expo-router/fundamentals.md)
- [Dynamic and Catch-All Routes](../../content/expo-router/dynamic-routes.md)
- [Typed Routes](../../content/expo-router/typed-routes.md)
- [Deep Links and Universal Links](../../content/expo-router/deep-linking.md)
