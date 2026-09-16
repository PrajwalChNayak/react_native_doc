---
title: File System
description: React Native has no filesystem API — which library to use instead, where each platform lets you write, and the permissions modern Android actually requires.
status: current
toolchain: cli
---

**React Native core has no filesystem API.** There is no `FileSystem` export, no `fs` module,
no `File` or `Blob`-to-disk path. Check the 0.87 export surface and you will find `AssetRegistry`
and `Image` — nothing that reads or writes a file.

What core does give you is `fetch`, which is enough to send a file you already have a URI for,
and that is why a surprising number of apps never need a filesystem library at all. If yours
does, you need a third-party native module, and you need to pick one that has shipped Codegen
support.

## Which library

**`@dr.pogodin/react-native-fs` 2.40.2** is the one this handbook recommends. Verified from the
published package: it declares `codegenConfig` with the spec name `ReactNativeFsSpec` and ships
a `TurboModuleRegistry` spec at `src/NativeReactNativeFs.ts`, so it is a real TurboModule rather
than a legacy module leaning on the interop layer.

It is a maintained fork of the original `react-native-fs`, which is still published at 2.20.0,
has no `codegenConfig`, and has not been updated in years. **Do not install `react-native-fs`.**
Its name still dominates search results and its answers are the ones you will find first.

If your actual job is "download or upload a large file without loading it into JavaScript
memory", `react-native-blob-util` 0.24.11 is the alternative worth knowing. It also ships a
Codegen spec (`ReactNativeBlobUtilSpec`), and it is built around streaming to and from the
network rather than general file manipulation.

> [!WARNING] Both declare `peerDependencies: {"react-native": "*"}`
> An open peer range is not a compatibility statement. What makes them safe on 0.87 is the
> Codegen spec, not the peer field. Apply the same test to anything else you consider — see
> [Native Dependency Compatibility](../migration/native-dependency-compatibility.md).

## Why it exists — and when NOT to use it

Reach for a filesystem when you are handling **files**: a downloaded PDF, a captured photo, an
export the user will share, a cache of images too large for a key-value store.

Do not reach for it for application state. Hand-rolled JSON-on-disk persistence is slower than
MMKV, has no atomicity, and gives you a corrupted-file recovery path to write and test. For
state, see [AsyncStorage vs MMKV](../state-and-data/asyncstorage-vs-mmkv.md); for anything
secret, see [Secure Storage](../state-and-data/secure-storage.md).

## Installation

:::tabs
@tab npm
```bash
npm install @dr.pogodin/react-native-fs
cd ios && bundle exec pod install
```
@tab yarn
```bash
yarn add @dr.pogodin/react-native-fs
cd ios && bundle exec pod install
```
@tab pnpm
```bash
pnpm add @dr.pogodin/react-native-fs
cd ios && bundle exec pod install
```
:::

## Native configuration

The good news: writing **inside your own app sandbox** needs no permission on either platform.
The configuration below is only for the cases where you step outside it.

:::tabs
@tab iOS

Nothing is required for sandbox reads and writes. Two optional entries matter:

```xml title=ios/AwesomeProject/Info.plist
<!-- Expose the app's Documents folder in the Files app and in iTunes/Finder
     file sharing. Only add these if the user is meant to see these files. -->
<key>UIFileSharingEnabled</key>
<true/>
<key>LSSupportsOpeningDocumentsInPlace</key>
<true/>

<!-- Only if you write images or videos into the user's photo library. -->
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Used to save your exported images to Photos.</string>
```

Background downloads need a delegate hook. `RNFSBackgroundDownloads` hands the session's
completion handler back to the library:

```objc title=ios/AwesomeProject/AppDelegate.mm
#import <RNFSBackgroundDownloads.h>

- (void)application:(UIApplication *)application
    handleEventsForBackgroundURLSession:(NSString *)identifier
                      completionHandler:(void (^)(void))completionHandler {
  [RNFSBackgroundDownloads setCompletionHandlerForIdentifier:identifier
                                           completionHandler:completionHandler];
}
```

iOS then gives you roughly **30 seconds** of execution before it expects
`completeHandlerIOS(jobId)` to be called from JavaScript. Do not unzip, transcode or upload in
that window — record what happened and finish the work when the user next opens the app.

@tab Android

Nothing is required for internal storage — `DocumentDirectoryPath`, `CachesDirectoryPath` and
`ExternalDirectoryPath` are all inside your app's own space.

Reading files the user chose or picked from shared media is where permissions start. Android 13
(API 33) split the old storage permission into per-type media permissions:

```xml title=android/app/src/main/AndroidManifest.xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

  <!-- Android 13+ (API 33): granular media access. Declare only the types you read. -->
  <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
  <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />

  <!-- Android 14+ (API 34): the "selected photos only" grant. -->
  <uses-permission android:name="android.permission.READ_MEDIA_VISUAL_USER_SELECTED" />

  <!-- Legacy devices only. Scoped storage made this a no-op from API 29 and
       it is not granted at all from API 33. -->
  <uses-permission
    android:name="android.permission.READ_EXTERNAL_STORAGE"
    android:maxSdkVersion="32" />

  <application ...>
    <!-- … -->
  </application>
</manifest>
```

`WRITE_EXTERNAL_STORAGE` does nothing from API 29 onward. If a tutorial tells you to request it
to save a file, that tutorial predates scoped storage by several years.

The reliable way to let a user open or save a file outside your sandbox is the system document
picker, which grants access to the chosen file without any permission at all. The library
exposes it as `pickFile()`.

:::

## Basic example

```ts-fragment title=src/files/notes.ts
import {
  DocumentDirectoryPath,
  exists,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from '@dr.pogodin/react-native-fs';

const DIR = `${DocumentDirectoryPath}/notes`;

export async function saveNote(id: string, text: string): Promise<void> {
  // mkdir is recursive and does not fail when the directory already exists.
  await mkdir(DIR);
  await writeFile(`${DIR}/${id}.txt`, text, 'utf8');
}

export async function readNote(id: string): Promise<string | null> {
  const path = `${DIR}/${id}.txt`;
  // Reading a missing file rejects; checking first keeps the caller's error
  // handling for real failures rather than for the ordinary empty case.
  if (!(await exists(path))) return null;
  return readFile(path, 'utf8');
}

export async function deleteNote(id: string): Promise<void> {
  const path = `${DIR}/${id}.txt`;
  if (await exists(path)) await unlink(path);
}
```

> [!NOTE] Why these blocks are not type-checked
> `@dr.pogodin/react-native-fs` is not installed in this repository's type-check harness, so its
> blocks are tagged `ts-fragment`. The signatures shown were read from the published `2.40.2`
> type definitions.

## How it works

### Directories are not interchangeable

Picking the wrong directory is the most consequential decision on this page, because it decides
whether your files get backed up, get deleted under storage pressure, or get rejected in review.

| Constant | Platform | Backed up | The OS may delete it | Use for |
| --- | --- | --- | --- | --- |
| `DocumentDirectoryPath` | both | yes | no | User-created content the user would miss |
| `CachesDirectoryPath` | both | no | **yes** | Anything you can re-download |
| `TemporaryDirectoryPath` | both | no | **yes** | Scratch space within one session |
| `LibraryDirectoryPath` | iOS | yes | no | App support data that is not user content |
| `ExternalDirectoryPath` | Android | varies | no | App-private files on external storage |
| `ExternalStorageDirectoryPath` | Android | no | no | Shared storage — needs permission, avoid |
| `DownloadDirectoryPath` | Android | no | no | The user's Downloads folder |
| `MainBundlePath` | iOS | n/a | no | **Read-only.** Files shipped in the app |

Two rules follow. **Downloaded caches go in `CachesDirectoryPath`** — Apple rejects apps that
fill `Documents` with re-downloadable data, and iCloud backups then carry it. And
**`MainBundlePath` is read-only**; a write there fails on device even when it appears to work in
a simulator.

### The API is promise-based and flat

| Function | Notes |
| --- | --- |
| `readFile(path, encodingOrOptions?)` / `writeFile(path, content, ...)` | Whole-file, string-based. `'utf8'`, `'ascii'` or `'base64'` |
| `read(path, length?, position?, ...)` / `write(path, contents, position?, ...)` | Partial reads and positioned writes |
| `appendFile(path, contents, ...)` | Append without reading first |
| `exists(path)`, `stat(path)`, `touch(path, mtime?, ctime?)` | Metadata |
| `mkdir(path, options?)`, `readDir(path)`, `readdir(path)`, `unlink(path)` | Directories. `readDir` returns objects, `readdir` returns names |
| `copyFile(from, into, options?)`, `moveFile(from, to, options?)` | Move is a rename where possible |
| `downloadFile(options)`, `uploadFiles(options)` | Return `{jobId, promise}`; cancel with `stopDownload(jobId)` |
| `hash(path, algorithm)` | Digest a file without reading it into JS |
| `getFSInfo()` | Free and total space |
| `pickFile(options?)` | System document picker; returns the chosen paths |
| `copyFileAssets`, `copyFileRes`, `readFileAssets`, `readFileRes`, `scanFile` | Android-only |
| `copyAssetsFileIOS`, `copyAssetsVideoIOS`, `pathForBundle`, `pathForGroup`, `completeHandlerIOS` | iOS-only |

### Downloading with progress and cancellation

```ts-fragment title=src/files/download.ts
import {CachesDirectoryPath, downloadFile, stopDownload} from '@dr.pogodin/react-native-fs';

export function downloadReport(url: string, onProgress: (fraction: number) => void) {
  // Caches, not Documents: this is re-downloadable and must not be backed up.
  const toFile = `${CachesDirectoryPath}/report.pdf`;

  const {jobId, promise} = downloadFile({
    fromUrl: url,
    toFile,
    // Progress fires often. Throttle it or you will re-render on every chunk.
    progressInterval: 250,
    progress: ({bytesWritten, contentLength}) => {
      if (contentLength > 0) onProgress(bytesWritten / contentLength);
    },
  });

  return {
    cancel: () => stopDownload(jobId),
    done: promise.then(result => (result.statusCode === 200 ? toFile : null)),
  };
}
```

`downloadFile` resolves with the HTTP status code rather than rejecting on a 404, so check
`statusCode`. A failed download still leaves a file at `toFile` — delete it, or your next
`exists()` check will report a truncated error page as a valid cached report.

### Paths are strings, and that is a hazard

Nothing here validates a path. A filename derived from a server response, a deep link or a
notification payload can contain `../` and escape the directory you intended.

```ts title=src/files/safeName.ts
/** Reduce an untrusted name to a single safe path segment. */
export function safeName(input: string): string {
  // Strip every separator and traversal sequence, then bound the length.
  const flattened = input.replace(/[/\\]/g, '_').replace(/\.{2,}/g, '_');
  const cleaned = flattened.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : 'file';
}
```

## Platform differences

:::tabs
@tab iOS

- Everything lives in the app sandbox, and the sandbox path **changes between launches** on
  some OS versions. Store a filename and rebuild the path from the constant at read time;
  never persist an absolute path.
- Files in `Documents` are included in iCloud and iTunes backups by default. Apple's storage
  guidelines are enforced in review, and "we put the cache in Documents" is a real rejection.
- `FileProtectionKeys` sets data-protection classes, which encrypt files at rest while the
  device is locked.
- `MainBundlePath` is read-only and code-signed. Writing there fails on device.
- Background downloads continue after the app is suspended, but you must implement the delegate
  hook and call `completeHandlerIOS`.

@tab Android

- Internal storage (`DocumentDirectoryPath`) is private to your app and needs no permission.
- Scoped storage has been mandatory since API 29. There is no general-purpose access to the
  external storage root; `WRITE_EXTERNAL_STORAGE` is a no-op and `READ_EXTERNAL_STORAGE` is not
  granted from API 33.
- Media access is per-type from API 33: `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`,
  `READ_MEDIA_AUDIO`, plus `READ_MEDIA_VISUAL_USER_SELECTED` for the partial grant on API 34+.
- A file written into a shared media directory is invisible to the gallery until it is indexed;
  `scanFile(path)` triggers that.
- `copyFileAssets` and `copyFileRes` reach into the APK's bundled assets and resources, which
  have no filesystem path of their own.

:::

## Performance considerations

- **Never read a large file with `readFile`.** It decodes the entire file into a JavaScript
  string. A 50 MB video read as base64 becomes roughly 67 MB of string, and the app is killed
  for memory before you get to use it. Use `downloadFile`/`uploadFiles` to move bytes without
  touching JS, or `hash()` to digest in place.
- **Every call crosses into native.** A loop of 2,000 `exists()` calls is 2,000 round trips.
  Prefer one `readDir` and filter in JavaScript.
- **Throttle progress callbacks.** `progressInterval` exists because the default rate will drive
  a re-render per chunk. See [Render Performance](../performance/render-performance.md).
- **Clean the cache yourself.** The OS may evict `CachesDirectoryPath` — but "may" is not "will",
  and an app that never deletes anything grows until the user notices in Settings.

## Security considerations

**Threat.** The app sandbox protects files from other apps on a healthy device. It protects
nothing on a rooted or jailbroken device, nothing from a device backup, and nothing from
somebody with a debuggable build. Anything you write to disk should be assumed readable by a
motivated attacker with the device in hand.

**Exploit.** Two things go wrong in practice.

First, secrets written to ordinary files. A cached API token, a downloaded document, a
"remember me" payload — all sitting in plaintext in the sandbox, and all readable in one
command on a debuggable build:

```bash
adb shell run-as com.awesomeproject cat files/session.json
```

On iOS, Xcode's Devices and Simulators window downloads the whole container as a `.xcappdata`
bundle you can open in Finder. No jailbreak required.

Second, path traversal. A server that returns `{"filename": "../../shared_prefs/auth.xml"}` and
an app that does `writeFile(`${DIR}/${filename}`, body)` will happily write outside its
directory, overwriting app data.

**Fix.**

1. **Do not put secrets in files.** Tokens, keys and credentials belong in the Keychain or the
   Android Keystore — see
   [Secure Storage: Keychain and Keystore](../security/secure-storage-keychain-keystore.md).
2. **Normalise every untrusted filename** with something like `safeName` above, and then verify
   the resolved path is still inside your directory before writing:

```ts title=src/files/withinDirectory.ts
/** True only when `candidate` is inside `directory`, after traversal is applied. */
export function withinDirectory(directory: string, candidate: string): boolean {
  const normalize = (p: string): string => {
    const out: string[] = [];
    for (const part of p.split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') out.pop();
      else out.push(part);
    }
    return `/${out.join('/')}`;
  };
  const root = normalize(directory);
  return normalize(candidate).startsWith(`${root}/`);
}
```

3. **Exclude sensitive caches from backup.** On iOS that means `CachesDirectoryPath` rather than
   `Documents`. On Android, set `android:allowBackup="false"` on `<application>`, or ship a
   backup rules file that excludes the paths in question.
4. **Delete on logout.** A signed-out user's cached documents should not survive the sign-out.

**Verification.** Run the flow, then enumerate the sandbox and read what is there:

```bash
adb shell run-as com.awesomeproject find . -type f
adb shell run-as com.awesomeproject cat files/<whatever you found>
```

Anything in that output you would not want printed on a screen is a finding. Then sign out and
run it again — whatever survived is a second finding.

## Common mistakes

- **Installing `react-native-fs`.** Wrong: the top search result, last published at 2.20.0 with
  no Codegen spec. Right: `@dr.pogodin/react-native-fs`, the maintained fork.
- **Persisting an absolute path.** Wrong: storing `/var/mobile/Containers/.../file.pdf` in a
  database. Right: store the filename and rebuild the path from the directory constant — the iOS
  container path changes between launches.
- **Putting downloads in `Documents`.** Wrong: caching re-downloadable content where iCloud backs
  it up. Right: `CachesDirectoryPath`. This is a concrete App Store rejection, not a style note.
- **Requesting `WRITE_EXTERNAL_STORAGE`.** Wrong: adding it so a save "works" on Android. Right:
  it has done nothing since API 29. Write to app storage, or use the document picker.
- **Reading a large file into a string.** Wrong: `readFile(videoPath, 'base64')` to upload it.
  Right: `uploadFiles`, which streams. The string form costs roughly 1.33x the file size in JS
  heap and will get the app killed.
- **Assuming `downloadFile` rejects on failure.** Wrong: `await promise` and treating no throw as
  success. Right: check `result.statusCode`, and delete the partial file when it is not 200.
- **Trusting a server-supplied filename.** Wrong: interpolating it straight into a path. Right:
  flatten it to one segment and verify the resolved path stays inside your directory.

## Related topics

- [Camera](camera.md) — where captured photos should be written.
- [Clipboard and Share](clipboard-and-share.md) — handing a file to another app.
- [AsyncStorage vs MMKV](../state-and-data/asyncstorage-vs-mmkv.md) — the right home for application state.
- [Secure Storage: Keychain and Keystore](../security/secure-storage-keychain-keystore.md) — the right home for secrets.
- [Permissions](permissions.md) — the Android media permissions this page references.
- [Native Dependency Compatibility](../migration/native-dependency-compatibility.md) — how to judge a library like this one.
