---
title: File System and Storage
description: Choosing between expo-file-system, AsyncStorage, SQLite and SecureStore, and using the File / Directory / Paths API that expo-file-system exposes in SDK 57.
status: current
toolchain: expo
sdk: 57
---

An Expo app has four distinct places to put data, and picking the wrong one is the most common
storage mistake. `expo-file-system` handles files on disk. AsyncStorage handles small unencrypted
key–value pairs. `expo-sqlite` handles structured, queryable data. `expo-secure-store` handles
secrets. They are not interchangeable.

```bash
npx expo install expo-file-system
```

That resolves `expo-file-system@~57.0.7` on SDK 57. `npx expo install` reads
`expo/bundledNativeModules.json` and installs the version built for your SDK; a plain
package-manager install fetches `latest`, which fails at runtime rather than at install time. See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

## Why it exists / when to use it — and when NOT to

Pick by the shape of the data, not by convenience:

| You have | Use | Why |
| --- | --- | --- |
| Binary or large text data: photos, downloads, exports, caches | `expo-file-system` | It is the only one that gives you a real file path and streaming. |
| A handful of small settings: theme, onboarding-seen, last tab | AsyncStorage (`@react-native-async-storage/async-storage`, `2.2.0` on SDK 57) | Simple, synchronous-feeling, no schema. |
| Rows you need to query, sort or join | [`expo-sqlite`](sqlite.md) | Reading a 5 MB JSON blob to find one record is not storage, it is a linear scan. |
| Tokens, keys, anything an attacker wants | [`expo-secure-store`](secure-store.md) | Keychain / Keystore backed. AsyncStorage is plaintext. |

Do **not** use `expo-file-system` as a key–value store by writing one JSON file per key. You get no
atomicity, no query, and a directory listing that grows without bound.

Do **not** use AsyncStorage for anything above a few hundred kilobytes. On Android it is backed by
a single SQLite table with a per-row size limit that varies by device; on iOS it is a file that is
fully read into memory.

## Expo Go vs development build

**Works in Expo Go.** `expo-file-system` is in the Expo Go module set, and all of the `File`,
`Directory` and `Paths` APIs work there.

The config plugin options (`enableFileSharing`, `supportsOpeningDocumentsInPlace`) set iOS
`Info.plist` keys, so they only take effect in a build you produce yourself. In Expo Go, the
documents directory is Expo Go's, not your app's — paths you record in development will not exist
in your production build.

## Basic example

```ts title=lib/notes.ts
import {Directory, File, Paths} from 'expo-file-system';

// Paths.document survives app restarts and is backed up; Paths.cache can be
// evicted by the OS at any time.
const notesDir = new Directory(Paths.document, 'notes');

export function saveNote(id: string, body: string): void {
  // create() is a no-op-free operation: call it, then write.
  if (!notesDir.exists) {
    notesDir.create({intermediates: true});
  }
  const file = new File(notesDir, `${id}.txt`);
  file.write(body);
}

export async function readNote(id: string): Promise<string | null> {
  const file = new File(notesDir, `${id}.txt`);
  return file.exists ? file.text() : null;
}

export function listNotes(): string[] {
  if (!notesDir.exists) {
    return [];
  }
  return notesDir
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map((file) => file.name);
}
```

## How it works

### `Paths`, `File` and `Directory`

SDK 57's `expo-file-system` is an object API, not a bag of `*Async` functions. Three exports do
almost everything:

**`Paths`** — static getters for the well-known directories, plus path helpers:

| Member | Type | Notes |
| --- | --- | --- |
| `Paths.document` | `Directory` | Persistent, backed up, yours. |
| `Paths.cache` | `Directory` | The OS may delete this at any time. |
| `Paths.bundle` | `Directory` | Read-only app bundle contents. |
| `Paths.appleSharedContainers` | `Record<string, Directory>` | iOS app-group containers. |
| `Paths.totalDiskSpace` / `Paths.availableDiskSpace` | `number` | Bytes. |
| `Paths.info(...uris)` | `PathInfo` | `{exists, isDirectory}`. |
| `Paths.join`, `dirname`, `basename`, `extname`, `parse`, `relative`, `normalize`, `isAbsolute` | statics | Node-`path`-shaped helpers. |

**`File`** — constructed from any combination of strings, `File`s and `Directory`s:
`new File(Paths.document, 'notes', 'a.txt')`.

| Member | Notes |
| --- | --- |
| `uri`, `name`, `extension`, `parentDirectory` | Getters. |
| `exists`, `size`, `md5`, `type`, `modificationTime`, `creationTime` | Properties, read synchronously. |
| `create(options?)`, `delete()`, `write(content, options?)` | Synchronous. |
| `text()`, `base64()`, `bytes()`, `json()`, `arrayBuffer()` | Async reads. |
| `textSync()`, `base64Sync()`, `bytesSync()` | Synchronous reads. |
| `copy` / `copySync`, `move` / `moveSync`, `rename(newName)` | Relocation. |
| `open(mode?)` | Returns a `FileHandle` for `readBytes` / `writeBytes` at an offset. |
| `readableStream()`, `writableStream()` | Web streams. |
| `watch(callback, options?)` | Returns a `WatchSubscription`. |
| `File.downloadFileAsync(url, destination, options?)` | Static. |
| `File.createDownloadTask(url, destination, options?)` | Static; returns a pausable `DownloadTask`. |
| `File.pickFileAsync(options?)` | Static; system file picker. |
| `upload(url, options?)` / `createUploadTask(url, options?)` | Instance methods. |

`File` implements `Blob`, so you can hand one straight to `fetch` or `FormData`.

**`Directory`** — `create`, `delete`, `list`, `createFile`, `createDirectory`, `copy`, `move`,
`rename`, `info`, `size`, `watch`, and the static `Directory.pickDirectoryAsync(initialUri?)`.

### Synchronous by default

Most of this API is synchronous. `file.write(...)`, `directory.create()`, `file.exists` and
`file.size` all block the JS thread. That is deliberate — these are fast native calls — but it
means a loop over a thousand files will jank your UI. Use the async variants (`text()`,
`copy()`, `move()`) inside loops.

### Downloads and uploads

```ts title=lib/download.ts
import {Directory, File, Paths} from 'expo-file-system';

export async function downloadReport(url: string): Promise<File> {
  const dir = new Directory(Paths.document, 'reports');
  if (!dir.exists) {
    dir.create({intermediates: true});
  }
  return File.downloadFileAsync(url, dir, {
    headers: {Accept: 'application/pdf'},
    onProgress({bytesWritten, totalBytes}) {
      // totalBytes is -1 when the server sends no Content-Length.
      if (totalBytes > 0) {
        console.log(`${Math.round((bytesWritten / totalBytes) * 100)}%`);
      }
    },
  });
}
```

For a download the user can pause and resume, or one that should survive the app being
backgrounded, use a task instead:

```ts title=lib/downloadTask.ts
import {Directory, File, Paths} from 'expo-file-system';
import type {DownloadPauseState} from 'expo-file-system';

export async function startLargeDownload(url: string): Promise<File | null> {
  const task = File.createDownloadTask(url, new Directory(Paths.cache), {
    // 'background' hands the transfer to the OS so it continues when the app
    // is not in the foreground. 'foreground' dies with the app.
    sessionType: 'background',
    onProgress({bytesWritten, totalBytes}) {
      console.log(bytesWritten, totalBytes);
    },
  });

  // savable() returns a plain object you can persist and hand to
  // DownloadTask.fromSavable(...) after a cold start to resume the transfer.
  const resumeState: DownloadPauseState = task.savable();
  console.log('resume from', resumeState.url);

  return task.downloadAsync();
}
```

A `DownloadTask` exposes `state`, `downloadAsync()`, `pause()` / `pauseAsync()`, `resumeAsync()`,
`cancel()`, `release()`, `addListener('progress', …)` and `savable()`. An `UploadTask` exposes
`state`, `uploadAsync()`, `cancel()`, `release()` and the same progress listener.

`UploadOptions` covers `httpMethod` (`'POST' | 'PUT' | 'PATCH'`), `uploadType`
(`UploadType.BINARY_CONTENT` or `UploadType.MULTIPART`), `fieldName`, `mimeType`, `parameters`,
`headers`, `onProgress`, `sessionType` and an `AbortSignal`. `UploadResult` is
`{body, status, headers}`.

### The legacy API still exists

The function-style API from earlier SDKs (`FileSystem.readAsStringAsync`,
`FileSystem.documentDirectory`, and friends) lives at `expo-file-system/legacy`.

> [!LEGACY] `expo-file-system/legacy`
> Import it only to keep existing code compiling while you migrate. New code should use `File`,
> `Directory` and `Paths` — they are the supported surface, and the legacy module is a compatibility
> shim.

## Native configuration

:::tabs
@tab iOS

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-file-system",
        {
          "enableFileSharing": true,
          "supportsOpeningDocumentsInPlace": true
        }
      ]
    ]
  }
}
```

| Option | `Info.plist` key | Effect |
| --- | --- | --- |
| `enableFileSharing` | `UIFileSharingEnabled` | Your app's Documents directory appears in the Files app and over USB. |
| `supportsOpeningDocumentsInPlace` | `LSSupportsOpeningDocumentsInPlace` | Other apps can open documents from your Documents directory in place rather than copying them. |

> [!WARNING] `enableFileSharing` is a disclosure decision
> Turning it on makes everything in `Paths.document` visible to the user and to anything that can
> read the Files app — including iTunes/Finder backups an attacker with the unlocked device can
> browse. Only enable it if the user is meant to see those files.

No permissions and no usage-description strings are required. `expo-file-system` only touches your
app's own sandbox; reading the user's photo library is [`expo-media-library`](camera-and-media.md),
which does need them.

@tab Android

No plugin options, no manifest permissions. Scoped storage means your app's own directories need no
permission, and `expo-file-system` does not reach outside them.

`File.pickFileAsync` and `Directory.pickDirectoryAsync` go through the Storage Access Framework, so
the user grants access per selection — there is no blanket storage permission to request.
:::

## Platform differences

| Concern | iOS | Android |
| --- | --- | --- |
| `Paths.document` backed up to the cloud | Yes (iCloud), unless excluded | Yes, if Auto Backup is on |
| `Paths.cache` eviction | System purges under disk pressure | System purges under disk pressure |
| `Paths.appleSharedContainers` | App groups | Empty |
| Background transfers | `NSURLSession` background configuration | WorkManager-backed |
| `enableFileSharing` | Exposes Documents in the Files app | No equivalent |
| `contentUri` on `File` | Not meaningful | `content://` URI for sharing with other apps |

## Common patterns

### Cache versus document, decided once

```ts title=lib/storagePaths.ts
import {Directory, Paths} from 'expo-file-system';

// Anything the user created or paid for: document. Anything you can re-derive
// from the network: cache. Getting this wrong means either losing user data or
// a storage-hog review complaint.
export const userData = new Directory(Paths.document, 'user');
export const derived = new Directory(Paths.cache, 'derived');

export function ensureDirs(): void {
  for (const dir of [userData, derived]) {
    if (!dir.exists) {
      dir.create({intermediates: true});
    }
  }
}
```

### Reading JSON without a manual parse

```ts title=lib/readConfig.ts
import {File, Paths} from 'expo-file-system';

type Config = {theme: 'light' | 'dark'};

export async function readConfig(): Promise<Config | null> {
  const file = new File(Paths.document, 'config.json');
  if (!file.exists) {
    return null;
  }
  // json() returns `any`; validate before trusting it.
  const parsed: unknown = await file.json();
  if (typeof parsed === 'object' && parsed !== null && 'theme' in parsed) {
    return parsed as Config;
  }
  return null;
}
```

### Checking free space before a big download

```ts title=lib/diskGuard.ts
import {Paths} from 'expo-file-system';

export function hasRoomFor(bytes: number): boolean {
  // Leave headroom: filling the disk makes the OS start killing your app.
  return Paths.availableDiskSpace > bytes * 1.5;
}
```

## Performance considerations

- **Do not synchronously loop.** `file.exists` and `file.write` are synchronous native calls. A
  hundred of them is fine; ten thousand blocks the JS thread long enough to drop frames.
- **Prefer streaming or a download task for anything over a few megabytes.** `file.text()` on a
  100 MB file reads the whole thing into the JS heap.
- **Use `md5` sparingly.** Reading it hashes the entire file every time you touch the property.
- **Let the OS manage the cache directory.** Do not write cleanup code that walks `Paths.cache` on
  every launch; the OS already evicts it, and your walk costs startup time.

## Security considerations

**Threat.** Everything `expo-file-system` writes is stored unencrypted inside the app sandbox. On a
rooted Android device or a jailbroken iPhone the sandbox is not a boundary, and on iOS anything in
Documents is additionally exposed if `enableFileSharing` is on or if the file is included in an
unencrypted backup.

**Exploit.** On a rooted emulator:

```bash
adb root
adb shell run-as com.example.myapp ls -R files
adb shell run-as com.example.myapp cat files/config.json
```

Any token, refresh token or API key you cached in a JSON file is now plaintext on the console.

**Fix.** Secrets go in [`expo-secure-store`](secure-store.md), which is backed by the Keychain and
the Android Keystore. Files stay files:

```ts title=lib/session.ts
import * as SecureStore from 'expo-secure-store';

// Not a JSON file in Paths.document.
export async function saveRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync('refresh_token', token);
}
```

**Verification.** Repeat the `run-as` listing above after the change and confirm the token no
longer appears anywhere under `files/`. On iOS, take an unencrypted local backup in Finder and grep
the backup for the token string.

Two more rules:

- **Do not put files whose contents are secret in `Paths.cache`.** It is the same sandbox, with the
  added property that you do not control its lifetime.
- **Treat file names as untrusted input.** A name derived from a server response can contain `..`
  or a path separator. Build paths with `Paths.join` and validate the result is still inside your
  directory before writing.

See [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md) and
[Secure Store vs AsyncStorage](../expo-security/secure-store-vs-asyncstorage.md).

## Common mistakes

- **Using AsyncStorage for secrets.** It is unencrypted plaintext. Wrong:
  `AsyncStorage.setItem('token', t)`. Right: `SecureStore.setItemAsync('token', t)`.
- **Storing user-created content in `Paths.cache`.** The OS deletes it without warning and the user
  reports data loss.
- **Writing to a directory that does not exist.** `new Directory(...)` does not create anything;
  call `create({intermediates: true})` first or the write throws.
- **Hardcoding a URI recorded during development.** Expo Go's document directory is not your app's.
  Always re-derive paths from `Paths.*`.
- **Assuming `onProgress`'s `totalBytes` is positive.** It is `-1` when the server sends no
  `Content-Length`, and `bytesWritten / totalBytes` then renders a negative percentage.
- **Reaching for `expo-file-system/legacy` in new code.** It is a compatibility shim. Use `File`,
  `Directory` and `Paths`.
- **Turning on `enableFileSharing` because a tutorial did.** It exposes your entire Documents
  directory to the user and to backups.

## Related topics

- [Secure Store](secure-store.md) — where tokens and keys belong.
- [SQLite](sqlite.md) — when the data has rows and you need to query it.
- [Secure Store vs AsyncStorage](../expo-security/secure-store-vs-asyncstorage.md) — exactly what AsyncStorage does not protect.
- [Camera and Media](camera-and-media.md) — reading and writing the user's photo library.
- [Background Tasks](background-tasks.md) — finishing a transfer when the app is not in the foreground.
- [Asset Strategy](../expo-performance/asset-strategy.md) — bundled assets versus downloaded ones.
