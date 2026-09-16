---
title: AsyncStorage vs MMKV
description: The two general-purpose key-value stores compared on API shape, synchronicity, performance and encryption — plus the MMKV 4 install trap almost every tutorial gets wrong.
status: current
toolchain: cli
---

Every app needs somewhere to put small values that survive a restart: a theme preference, an
onboarding flag, a last-selected tab, a cached response. React Native has no `localStorage`, so
this is a library decision, and there are two serious options.

**`@react-native-async-storage/async-storage` 3.1.1** is the community standard: asynchronous,
promise-based, widely assumed by other libraries. **`react-native-mmkv` 4.3.2** wraps Tencent's
MMKV through Nitro Modules: synchronous, considerably faster, and with an install step almost
every tutorial gets wrong.

Neither is secure storage. That is the first thing to settle, and it is settled below.

## Why it exists / when to use it — and when NOT to

Use a key-value store for small, structured, non-sensitive values. Do **not** use one for:

| Instead of | Use |
| --- | --- |
| Credentials, tokens, API keys | The Keychain or Keystore — [Secure Storage](secure-storage.md) |
| Large binary blobs, images, downloads | The file system |
| Relational or queryable data | A database |
| Server data with a staleness model | A query cache — [Data Fetching and Caching](data-fetching.md) |
| Values that only matter while the app is open | `useState`, or a store |

## The comparison

| | AsyncStorage 3.1.1 | MMKV 4.3.2 |
| --- | --- | --- |
| Synchronicity | **Asynchronous** — every call returns a Promise | **Synchronous** — every call returns a value |
| API shape | `getItem` / `setItem` / `removeItem` / `getMany` / `setMany` / `removeMany` / `getAllKeys` / `clear` | `set` / `getString` / `getNumber` / `getBoolean` / `getBuffer` / `contains` / `remove` / `getAllKeys` / `clearAll` |
| Value types | Strings only — you serialise | `string`, `number`, `boolean`, `ArrayBuffer` natively |
| Underlying storage | SQLite (Android), files (iOS) | Memory-mapped file, both platforms |
| Typical performance | Milliseconds per call, plus a thread hop | Microseconds; no thread hop |
| Multiple instances | `createAsyncStorage(databaseName)` | `createMMKV({id})` |
| Encryption | **None** | AES-128 or AES-256, opt-in |
| Size limits | No documented hard limit; performance degrades with size | Designed for many small values; not for megabyte blobs |
| React hooks | None built in | `useMMKVString`, `useMMKVNumber`, `useMMKVBoolean`, `useMMKVObject`, `useMMKVBuffer`, `useMMKVKeys`, `useMMKVListener` |
| Change notifications | None | `addOnValueChangedListener` |
| Extra install steps | None beyond `pod install` | **Requires `react-native-nitro-modules`** |
| Ecosystem assumptions | Many libraries default to it | You write a small adapter |
| Migration cost from the other | Straightforward — synchronous to asynchronous is the hard direction | Straightforward — you can drop the `await` |

### Which to choose

**MMKV, unless something specific stops you.** Synchronous reads remove an entire class of bug:
no hydration flash on startup, no "the flag was not loaded yet" race, no `await` in a code path
that cannot be asynchronous.

**AsyncStorage when** a library you depend on expects it, when you want the option with no native
peer to manage, or when your team would rather not add a Nitro dependency to the build.

## The MMKV 4 install trap

This is the most common MMKV problem and it produces a runtime crash, not a build error.

> [!DANGER] Installing `react-native-mmkv` alone is not enough
> MMKV 4 is built on **Nitro Modules**. Read from its published manifest, its peer dependencies
> are `react`, `react-native` **and `react-native-nitro-modules`**. A peer dependency is not
> installed for you. Skip it and the app builds, then throws when something first touches the
> storage — usually on a screen unrelated to the code you just wrote.

:::tabs
@tab npm
```bash
npm install react-native-mmkv react-native-nitro-modules
cd ios && bundle exec pod install
```
@tab yarn
```bash
yarn add react-native-mmkv react-native-nitro-modules
cd ios && bundle exec pod install
```
@tab pnpm
```bash
pnpm add react-native-mmkv react-native-nitro-modules
cd ios && bundle exec pod install
```
:::

Verified versions on 2026-09-12: `react-native-mmkv` **4.3.2**, `react-native-nitro-modules`
**0.37.1**. Nitro's own peers are `react` and `react-native`, both unconstrained.

> [!WARNING] `new MMKV()` is the version 3 API
> Almost every article and answer you will find constructs the store with `new MMKV({id: '...'})`.
> In 4.x that export does not exist as a constructor: `MMKV` is a **type**, and the factory is
> **`createMMKV(configuration?)`**. If a snippet calls `new MMKV()`, it predates version 4.

## Basic example

### AsyncStorage

```ts title=src/storage/preferences.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

type Theme = 'light' | 'dark' | 'auto';

const THEME_KEY = 'preferences.theme';

/** Every value is a string. Anything else is your serialisation problem. */
export async function readTheme(): Promise<Theme> {
  const value = await AsyncStorage.getItem(THEME_KEY);
  // getItem resolves to null — not undefined — when the key is absent.
  if (value === 'light' || value === 'dark' || value === 'auto') {
    return value;
  }
  return 'auto';
}

export async function writeTheme(theme: Theme): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, theme);
}
```

### MMKV

```ts title=src/storage/preferencesMmkv.ts
import {createMMKV} from 'react-native-mmkv';
import type {MMKV} from 'react-native-mmkv';

type Theme = 'light' | 'dark' | 'auto';

const THEME_KEY = 'preferences.theme';

/**
 * One instance per concern. The id names the underlying file, so separate ids
 * mean separate files that can be cleared independently.
 */
export const preferences: MMKV = createMMKV({id: 'preferences'});

/** No promise. This can be called during the first render. */
export function readTheme(): Theme {
  const value = preferences.getString(THEME_KEY);
  // Getters return `undefined` — not null — when the key is absent.
  if (value === 'light' || value === 'dark' || value === 'auto') {
    return value;
  }
  return 'auto';
}

export function writeTheme(theme: Theme): void {
  preferences.set(THEME_KEY, theme);
}
```

That difference — a function that returns a value versus a function that returns a promise — is
the whole practical argument. The MMKV version can be called from a component body, from a
selector, from a module-scope initialiser.

## How it works

### AsyncStorage 3.x changed its API

If you are upgrading from version 2, this matters more than the choice of library. Read from the
installed 3.1.1 type definitions, the interface is:

| Method | Signature |
| --- | --- |
| `getItem` | `(key: string) => Promise<string \| null>` |
| `setItem` | `(key: string, value: string) => Promise<void>` |
| `removeItem` | `(key: string) => Promise<void>` |
| `getMany` | `(keys: string[]) => Promise<Record<string, string \| null>>` |
| `setMany` | `(entries: Record<string, string>) => Promise<void>` |
| `removeMany` | `(keys: string[]) => Promise<void>` |
| `getAllKeys` | `() => Promise<string[]>` |
| `clear` | `() => Promise<void>` |

> [!WARNING] `multiGet`, `multiSet`, `multiRemove` and `mergeItem` are gone in 3.x
> The batch methods were renamed and reshaped: `getMany` returns a **record**, not an array of
> pairs, and `setMany` takes a **record**, not an array of pairs. `mergeItem` and `multiMerge`
> are not on the 3.1.1 interface at all. Code written against version 2 does not compile, which
> is the good outcome — the bad one is a snippet you copy that silently does not match.

Two more 3.x additions worth knowing:

```ts title=src/storage/instances.ts
import {createAsyncStorage} from '@react-native-async-storage/async-storage';
import {AsyncStorageError} from '@react-native-async-storage/async-storage';

/**
 * A named instance is a separate database. Useful for keeping a large,
 * disposable cache away from small preferences you never want to clear by
 * accident.
 */
export const analyticsStorage = createAsyncStorage('analytics');

export async function readSafely(key: string): Promise<string | null> {
  try {
    return await analyticsStorage.getItem(key);
  } catch (error: unknown) {
    // The package throws a typed error, so you can distinguish a storage
    // failure from anything else that went wrong in the same try block.
    if (error instanceof AsyncStorageError) {
      return null;
    }
    throw error;
  }
}
```

### MMKV is memory-mapped, which is why it is fast

MMKV maps its file into memory, so a read is a memory access rather than a database query and a
thread hop. Writes are appended and the OS flushes the page. There is no serialisation across a
native boundary per call.

The practical consequences:

- **Reads are effectively free.** Reading a flag in a render is fine.
- **Writes are cheap but not free.** The file grows by append, which is why `trim()` exists.
- **It is not a database.** No queries, no indexes, no transactions. Many small values, not a few
  large ones.

The typed getters are separate functions because the value types are native:

```ts title=src/storage/typedValues.ts
import {createMMKV} from 'react-native-mmkv';

const store = createMMKV({id: 'typed'});

export function demonstrate(): void {
  // set() accepts boolean | string | number | ArrayBuffer.
  store.set('name', 'Ada');
  store.set('age', 36);
  store.set('admin', true);

  // Each getter returns `T | undefined`. There is no generic get().
  const name: string | undefined = store.getString('name');
  const age: number | undefined = store.getNumber('age');
  const admin: boolean | undefined = store.getBoolean('admin');
  void name;
  void age;
  void admin;

  // Objects are your serialisation, the same as AsyncStorage.
  store.set('user', JSON.stringify({id: '1', name: 'Ada'}));
}
```

### MMKV's React hooks

These subscribe to the underlying value and re-render when it changes — including when it is
changed from somewhere else entirely, such as another instance of the same store.

```tsx title=src/components/ThemeToggle.tsx
import {Button, Text, View} from 'react-native';
import {useMMKVString} from 'react-native-mmkv';

export function ThemeToggle() {
  // Reads synchronously on the first render — no loading state, no flash.
  const [theme, setTheme] = useMMKVString('preferences.theme');

  return (
    <View>
      <Text>{theme ?? 'auto'}</Text>
      <Button title="Dark" onPress={() => setTheme('dark')} />
    </View>
  );
}
```

`useMMKVObject<T>(key)` does the JSON round trip for you, and `useMMKVListener(fn)` fires for
every key that changes in the instance.

### Encryption, and what it is worth

MMKV takes an encryption key at creation time:

```ts title=src/storage/encrypted.ts
import {createMMKV} from 'react-native-mmkv';
import type {MMKV} from 'react-native-mmkv';

/**
 * The key length is fixed by the algorithm: 16 bytes for AES-128 (the
 * default) and 32 bytes for AES-256. A longer string is not more secure; it
 * is rejected.
 */
export function createEncryptedStore(key: string): MMKV {
  return createMMKV({
    id: 'encrypted-cache',
    encryptionKey: key,
    encryptionType: 'AES-256',
  });
}
```

> [!DANGER] An encryption key that ships in the bundle protects nothing
> If `createEncryptedStore('my-secret-key')` appears anywhere in your source, that string is in
> the JavaScript bundle, and the bundle is readable — [Why Secrets in JS Are
> Readable](../security/secrets-in-the-bundle.md) shows exactly how, with commands. An attacker
> who can read the encrypted MMKV file can also read the key that decrypts it, so the encryption
> buys nothing against the attacker who matters.
>
> The only version of this that helps is one where the key is **generated on the device on first
> launch and stored in the Keychain or Keystore**, so it never appears in the binary. At which
> point you are already using secure storage — and for a credential you may as well put the
> credential there directly. Encrypted MMKV is worth having for *bulk* data you want at rest
> protection for; it is not a credential store.

## Security considerations

### Threat

An attacker with file-level access to the app's data directory. That is a rooted or jailbroken
device, a debuggable build, a device backup copied to a laptop, or malware with the right
permissions.

### Exploit

AsyncStorage is a plain database with plain values. On a debuggable Android build no root is
needed at all:

```bash
# Dump AsyncStorage's database and read every row.
adb shell run-as com.example.app cat databases/AsyncStorage > AsyncStorage.db
sqlite3 AsyncStorage.db "SELECT key, value FROM Storage;"
```

Unencrypted MMKV is the same story with a different file format — the values are readable strings
inside the mapped file:

```bash
adb shell run-as com.example.app ls files/mmkv
adb shell run-as com.example.app cat files/mmkv/preferences | strings | head
```

### Fix

Three rules, in order of importance:

1. **Nothing sensitive goes in either store.** Tokens, refresh tokens, API keys, personal data
   you would not want in a backup. Those go in the Keychain or Keystore — see
   [Secure Storage](secure-storage.md) and
   [Keychain and Keystore](../security/secure-storage-keychain-keystore.md).
2. **If you encrypt MMKV, derive the key on-device and store it in the Keychain or Keystore.** A
   literal in the source is not a key.
3. **Check your Android backup rules.** `android:allowBackup="true"` is the default and it makes
   the app's data directory eligible for transfer off the device.

### Verification

```bash
# 1. What is actually in AsyncStorage right now?
adb shell run-as com.example.app cat databases/AsyncStorage > /tmp/as.db
sqlite3 /tmp/as.db "SELECT key, substr(value, 1, 60) FROM Storage;"

# 2. What is actually in the MMKV file?
adb shell run-as com.example.app cat files/mmkv/preferences | strings

# 3. Does the manifest let this leave the device?
grep -n "allowBackup\|dataExtractionRules" android/app/src/main/AndroidManifest.xml
```

Read every row and every extracted string. A key named `user`, `session` or `profile` that
happens to contain a token counts as a failure even though the name looks innocent.

## Platform differences

:::tabs
@tab iOS
AsyncStorage stores a `manifest.json` plus per-entry files under the app's Application Support
directory. MMKV maps a file under the app's documents directory by default, and picks up an App
Group container automatically if one is configured and no `path` is given — which is how a widget
or an extension reads the same store.

MMKV's `mode: 'multi-process'` is what you want when an extension writes to the same instance.
@tab Android
AsyncStorage 3.x uses a SQLite database named `AsyncStorage` (migrated from the older
`RKStorage`). MMKV writes to `files/mmkv/<id>`.

Android's auto-backup is on by default. Both stores live in the app data directory and are
therefore eligible for backup unless you exclude them explicitly.

Android also kills the process without warning. MMKV's synchronous writes are already on disk
when the call returns; an AsyncStorage write that was still in flight is not.
:::

## Common patterns

### One adapter, so the choice is reversible

Wrap whichever you pick behind a tiny interface. That makes the migration below a one-file change
and makes tests trivial.

```ts title=src/storage/kv.ts
import {createMMKV} from 'react-native-mmkv';

/**
 * The app talks to this, not to MMKV or AsyncStorage directly. Synchronous
 * by design — the asynchronous option can be adapted to it, but not the
 * other way around.
 */
export type KeyValueStore = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const store = createMMKV({id: 'app'});

export const kv: KeyValueStore = {
  getString: (key) => store.getString(key),
  set: (key, value) => store.set(key, value),
  remove: (key) => {
    store.remove(key);
  },
  clear: () => store.clearAll(),
};
```

### Migrating from AsyncStorage to MMKV

Run it once, keyed on a flag in the destination store so it never runs twice.

```ts title=src/storage/migrateToMmkv.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createMMKV} from 'react-native-mmkv';

const store = createMMKV({id: 'app'});
const MIGRATED_KEY = 'migration.asyncStorage.v1';

/**
 * Call once during startup, before anything reads a migrated key. Everything
 * in AsyncStorage is a string, so it maps straight onto MMKV's set().
 *
 * Deliberately does not clear AsyncStorage: leave the old data in place for
 * one release so a rollback is not a data loss event, then delete the
 * migration and the old store together.
 */
export async function migrateToMmkv(): Promise<void> {
  if (store.getBoolean(MIGRATED_KEY) === true) {
    return;
  }

  const keys = await AsyncStorage.getAllKeys();
  const entries = await AsyncStorage.getMany(keys);

  for (const [key, value] of Object.entries(entries)) {
    if (value !== null) {
      store.set(key, value);
    }
  }

  // Set the flag last, so an interrupted migration runs again next launch.
  store.set(MIGRATED_KEY, true);
}
```

Because MMKV is synchronous and AsyncStorage is not, the migration itself is the only
asynchronous code you need — after it runs, every read site can drop its `await`.

### Namespaced keys

Both stores are flat. `preferences.theme`, `cache.feed.page1`, `migration.v1` — a prefix per
concern makes a targeted clear possible and makes a dump readable.

## Performance considerations

- **AsyncStorage costs a thread hop per call.** That is fine for a handful of calls at startup
  and expensive in a loop. Use `getMany` and `setMany` rather than awaiting in a `for`.
- **MMKV reads are effectively free**, so the usual advice about caching reads in a variable does
  not apply. Read at the point of use.
- **Neither should hold megabytes.** MMKV's file is memory-mapped, so a large store is resident
  memory. AsyncStorage degrades as the database grows. Large payloads belong on the file system.
- **MMKV appends on write and does not shrink.** After deleting a large number of keys, call
  `trim()` once. Not on a schedule — after a bulk delete.
- **`compareBeforeSet: true`** makes MMKV skip the write when the value is unchanged. Worth
  setting when something writes the same value repeatedly, such as a scroll position.
- **Hydration is where AsyncStorage actually hurts.** Everything that must be read before the
  first meaningful frame is a promise, which means a splash screen or a flash of default state.
  This is the largest practical difference between the two.

## Common mistakes

- **Installing MMKV without Nitro Modules.** Wrong: `npm install react-native-mmkv`. Right:
  `npm install react-native-mmkv react-native-nitro-modules`. The build succeeds and the app
  crashes at first use.
- **Using `new MMKV()`.** That is the pre-4.x API. In 4.3.2, `MMKV` is a type and the factory is
  `createMMKV(configuration?)`.
- **Using `multiGet` / `multiSet` / `multiRemove` / `mergeItem` on AsyncStorage 3.x.** They are
  not on the interface. The replacements are `getMany`, `setMany` and `removeMany`, and they take
  and return **records**, not arrays of pairs. There is no merge.
- **Confusing `null` and `undefined`.** `AsyncStorage.getItem` resolves to `null` for a missing
  key; MMKV's getters return `undefined`. A `=== null` check ported between the two silently
  stops working.
- **Treating either as secure storage.** Both are readable on a rooted or jailbroken device and
  in backups. AsyncStorage is not encrypted at all, and MMKV's encryption is only as good as
  where the key lives.
- **Hard-coding an MMKV encryption key.** It ships in the bundle. Generate it on the device and
  keep it in the Keychain or Keystore.
- **Storing a large blob.** A memory-mapped file is resident memory; a growing SQLite database is
  slow queries. Use the file system.
- **Forgetting the hydration gap with AsyncStorage.** Reads finish after the first render. An
  onboarding check that runs on the first render shows onboarding to every returning user for one
  frame.
- **Creating a new MMKV instance per call.** `createMMKV` opens a file. Create the instance once
  at module scope and export it.

## Related topics

- [Secure Storage](secure-storage.md) — where credentials go instead of either of these.
- [Keychain and Keystore](../security/secure-storage-keychain-keystore.md) — the same subject from the security side, with the full exploit walkthrough.
- [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md) — why a hard-coded encryption key is not a key.
- [Offline-First](offline-first.md) — what you actually persist, and how it is rehydrated.
- [Zustand and Redux Toolkit](zustand-and-redux.md) — the store whose persistence backend this is.
- [Data Fetching and Caching](data-fetching.md) — server data, which should not be hand-persisted here.
- [App Lifecycle and AppState](app-lifecycle.md) — why "save on exit" is not a reliable hook.
- [Startup Time](../performance/startup-time.md) — where asynchronous hydration shows up in a cold start.
