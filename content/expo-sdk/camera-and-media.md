---
title: Camera and Media
description: Taking photos and scanning barcodes with expo-camera, letting users pick images with expo-image-picker, and saving to the photo library with expo-media-library — with the usage strings that stop iOS from crashing.
status: current
toolchain: expo
sdk: 57
---

Three packages cover the camera and the photo library, and picking the right one saves a lot of code:

| Package | SDK 57 | Use it when |
| --- | --- | --- |
| `expo-image-picker` | `~57.0.17` | The user picks an existing photo, or takes one with the **system** camera UI. |
| `expo-camera` | `~57.0.5` | You need an **in-app** camera preview: custom UI, barcode scanning, video recording. |
| `expo-media-library` | `~57.0.5` | You read the library directly or **save** a file into it. |

```bash
npx expo install expo-image-picker expo-camera expo-media-library
```

Install only the ones you use; each adds permissions to your app. See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

## Why it exists / when to use it — and when NOT to

Reach for `expo-image-picker` first. The system picker is familiar, handles cropping, and on iOS needs
**no photo-library permission at all** to let the user choose images. Most "upload an avatar" features
need nothing else.

Use `expo-camera` only when the system UI does not fit: a QR scanner, a document-capture overlay, a
camera embedded in a screen.

Do **not** use `expo-media-library` to let a user choose one photo — that requests broad library access
for a job the picker does without it. Users notice, and app review asks why.

## Expo Go vs development build

**All three are included in Expo Go**, so you can prototype there. Two caveats:

- **Your usage strings do not apply in Expo Go.** The permission prompts show Expo Go's text, not yours.
  The first time your own strings are exercised is in a
  [development build](../expo-development-builds/why-you-need-one.md) — test there before release.
- **Simulators have no camera.** `CameraView` and `launchCameraAsync` need a physical device; the iOS
  Simulator has no camera to open.

## Basic example

Pick one image with the system picker:

```tsx title=components/AvatarPicker.tsx
import * as ImagePicker from 'expo-image-picker';
import {useState} from 'react';
import {Button, Image, View} from 'react-native';

export function AvatarPicker() {
  const [uri, setUri] = useState<string | null>(null);

  async function pick() {
    // No permission request: the iOS system picker runs out of process and
    // only hands back what the user chose.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setUri(result.assets[0].uri);
    }
  }

  return (
    <View>
      <Button title="Choose photo" onPress={pick} />
      {uri !== null && <Image source={{uri}} style={{width: 120, height: 120}} />}
    </View>
  );
}
```

## How it works

### `expo-image-picker`

| Function | Behaviour |
| --- | --- |
| `launchImageLibraryAsync(options?)` | Opens the system photo picker. |
| `launchCameraAsync(options?)` | Opens the system camera. **Requires camera permission first.** |
| `requestCameraPermissionsAsync()` / `useCameraPermissions()` | Camera permission. |
| `requestMediaLibraryPermissionsAsync(writeOnly?)` / `useMediaLibraryPermissions()` | Library permission, when you need it. |
| `getPendingResultAsync()` | Recovers a result lost because Android killed the activity. |

Both launchers resolve an `ImagePickerResult`: either `{canceled: true, assets: null}` or
`{canceled: false, assets: ImagePickerAsset[]}`. Always check `canceled` before touching `assets`.

| Option | Meaning |
| --- | --- |
| `mediaTypes` | `'images'`, `'videos'`, `'livePhotos'`, or an array of them. |
| `allowsEditing` | Show the crop UI. |
| `aspect` | `[x, y]` crop ratio, used with `allowsEditing` on Android. |
| `quality` | `0`–`1` compression. |
| `allowsMultipleSelection` | Return more than one asset. |
| `base64` | Include base64 data on each asset — large; avoid unless you must. |
| `exif` | Include EXIF metadata — includes **GPS** on many photos. |

> [!DEPRECATED] `MediaTypeOptions`
> Older code passes `mediaTypes: ImagePicker.MediaTypeOptions.Images`. SDK 57 still accepts it for
> compatibility, but the current form is the string `'images'` or an array such as `['images', 'videos']`.

### `expo-camera`

`CameraView` renders a live preview. You call methods on it through a ref:

```tsx title=components/CaptureScreen.tsx
import {CameraView, useCameraPermissions, type CameraType} from 'expo-camera';
import {useRef, useState} from 'react';
import {Button, StyleSheet, Text, View} from 'react-native';

export function CaptureScreen({onCaptured}: {onCaptured: (uri: string) => void}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false);
  // Type the ref by the component itself. CameraView is a class component.
  const camera = useRef<CameraView | null>(null);

  if (!permission) {
    return <View />; // still loading the permission state
  }

  if (!permission.granted) {
    return (
      <View>
        <Text>Camera access is needed to take a photo.</Text>
        {permission.canAskAgain ? (
          <Button title="Allow camera" onPress={requestPermission} />
        ) : (
          <Text>Enable camera access for this app in Settings.</Text>
        )}
      </View>
    );
  }

  async function capture() {
    // takePictureAsync before onCameraReady throws or captures a stale frame.
    if (!ready || camera.current === null) {
      return;
    }
    const photo = await camera.current.takePictureAsync({quality: 0.8});
    onCaptured(photo.uri);
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={camera}
        style={styles.camera}
        facing={facing}
        onCameraReady={() => setReady(true)}
      />
      <Button title="Flip" onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} />
      <Button title="Capture" onPress={capture} disabled={!ready} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  camera: {flex: 1},
});
```

| `CameraView` prop | Meaning |
| --- | --- |
| `facing` | `'front'` or `'back'`. |
| `flash` | `'off'`, `'on'`, `'auto'`, `'screen'`. |
| `enableTorch` | Keep the torch on. |
| `mode` | `'picture'` or `'video'`. |
| `zoom` | `0`–`1`. |
| `active` | Pause the preview without unmounting. |
| `barcodeScannerSettings` | `{barcodeTypes: [...]}` to limit which codes are detected. |
| `onBarcodeScanned` | Called with `{type, data, ...}` for each detected code. |
| `onCameraReady` | The preview is running; capture is now safe. |
| `onMountError` | The camera failed to start. |

> [!WARNING] Only one camera preview can be active
> Expo's documentation states only one `CameraView` can be active at a time. With several screens, unmount
> the camera — or set `active={false}` — when its screen loses focus, or the next one shows a black
> preview.

### `expo-media-library`

SDK 57 ships a class-based API: `Asset`, `Album` and `Query`. The older function-style API
(`saveToLibraryAsync`, `createAssetAsync`, `getAssetsAsync`, …) is still exported from the main entry
point but is marked deprecated and **throws at runtime**; it lives on under `expo-media-library/legacy`.

```ts title=lib/saveToPhotos.ts
import {Album, Asset, requestPermissionsAsync} from 'expo-media-library';

export async function saveToPhotos(localUri: string): Promise<boolean> {
  // writeOnly: true asks only for add-to-library access, which is all a
  // save needs.
  const {granted} = await requestPermissionsAsync(true);
  if (!granted) {
    return false;
  }

  const asset = await Asset.create(localUri);
  const existing = await Album.get('MyApp');
  if (existing === null) {
    await Album.create('MyApp', [asset]);
  } else {
    await existing.add(asset);
  }
  return true;
}
```

> [!LEGACY] Function-style media library calls
> `MediaLibrary.saveToLibraryAsync(uri)` and `MediaLibrary.createAssetAsync(uri)` are deprecated in SDK 57
> and throw from the main import. Use `Asset.create(uri)`, or import the old function from
> `expo-media-library/legacy` while you migrate.

## Native configuration

Each package has a config plugin that writes the usage strings and permissions. The strings you pass are
what users see in the permission dialog, so write them as a reason, not a label.

:::tabs
@tab iOS

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-image-picker",
        {
          "photosPermission": "Choose a photo from your library to use as your profile picture.",
          "cameraPermission": "Take a photo to use as your profile picture.",
          "microphonePermission": false
        }
      ],
      [
        "expo-camera",
        {
          "cameraPermission": "Scan QR codes on event tickets.",
          "microphonePermission": "Record audio with your video clips."
        }
      ],
      [
        "expo-media-library",
        {
          "photosPermission": "Show your saved scans.",
          "savePhotosPermission": "Save scanned documents to your photo library."
        }
      ]
    ]
  }
}
```

| Plugin option | `Info.plist` key |
| --- | --- |
| `expo-image-picker` → `photosPermission` | `NSPhotoLibraryUsageDescription` |
| `expo-image-picker` → `cameraPermission` | `NSCameraUsageDescription` |
| `expo-image-picker` → `microphonePermission` | `NSMicrophoneUsageDescription` |
| `expo-camera` → `cameraPermission` | `NSCameraUsageDescription` |
| `expo-camera` → `microphonePermission` | `NSMicrophoneUsageDescription` |
| `expo-media-library` → `photosPermission` | `NSPhotoLibraryUsageDescription` |
| `expo-media-library` → `savePhotosPermission` | `NSPhotoLibraryAddUsageDescription` |
| `expo-media-library` → `preventAutomaticLimitedAccessAlert` | `PHPhotoLibraryPreventAutomaticLimitedAccessAlert` |

If you omit an option, the plugin writes a generic default such as
`"Allow $(PRODUCT_NAME) to access your camera"`. That prevents the crash, but App Review routinely rejects
vague purpose strings.

> [!DANGER] A missing usage string is an instant crash
> If code touches the camera, microphone or photo library and the matching `NS…UsageDescription` key is
> absent from `Info.plist`, iOS terminates the app immediately — no JavaScript error, no dialog. This
> happens most often when a package is added **without** its config plugin in `app.json` and the native
> project is not regenerated.

@tab Android

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-camera",
        {
          "recordAudioAndroid": false,
          "barcodeScannerEnabled": true
        }
      ],
      [
        "expo-media-library",
        {
          "granularPermissions": ["photo"],
          "isAccessMediaLocationEnabled": false
        }
      ],
      [
        "expo-image-picker",
        {
          "microphonePermission": false
        }
      ]
    ]
  }
}
```

Permissions each plugin adds to `AndroidManifest.xml`:

| Package | Permissions |
| --- | --- |
| `expo-camera` | `android.permission.CAMERA`; `android.permission.RECORD_AUDIO` unless `recordAudioAndroid: false` |
| `expo-image-picker` | `android.permission.RECORD_AUDIO` unless `microphonePermission: false`. Setting `cameraPermission` or `microphonePermission` to `false` **blocks** that permission from being added by any package. |
| `expo-media-library` | `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_VISUAL_USER_SELECTED`, plus `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / `READ_MEDIA_AUDIO` from `granularPermissions` (default: all three); `ACCESS_MEDIA_LOCATION` when `isAccessMediaLocationEnabled` is `true` |

`expo-camera`'s `barcodeScannerEnabled` (default `true`) controls whether the barcode scanning dependency is
built in. Set it to `false` if you never scan, to reduce app size.
:::

After changing any plugin option, rebuild — the plugin output is native code. See
[What a Config Plugin Is](../expo-config-plugins/what-they-are.md).

## Platform differences

| Concern | iOS | Android |
| --- | --- | --- |
| Picking from the library | No permission needed | Uses the system photo picker; permissions depend on the plugin configuration |
| Limited library access | User can grant access to selected photos only (`accessPrivileges: 'limited'`) | `READ_MEDIA_VISUAL_USER_SELECTED` on Android 14+ |
| Lost picker result | Not applicable | The OS may kill the activity while the picker is open — recover with `getPendingResultAsync()` |
| Camera on simulator / emulator | No camera | Emulator can simulate one |
| `takePictureAsync` while preview paused | Captures the last frame | Throws |

### Recovering a result Android threw away

```ts title=lib/pendingPick.ts
import * as ImagePicker from 'expo-image-picker';

export async function recoverPendingPick(): Promise<string | null> {
  // Call on startup. If Android destroyed MainActivity while the picker was
  // open, the selection is waiting here instead of in your original promise.
  const pending = await ImagePicker.getPendingResultAsync();
  if (pending && 'canceled' in pending && !pending.canceled) {
    return pending.assets[0].uri;
  }
  return null;
}
```

Test this path with **Developer options → Don't keep activities** turned on.

## Common patterns

### A QR code scanner that fires once

```tsx title=components/TicketScanner.tsx
import {CameraView, useCameraPermissions, type BarcodeScanningResult} from 'expo-camera';
import {useRef} from 'react';
import {Button, StyleSheet, View} from 'react-native';

export function TicketScanner({onTicket}: {onTicket: (code: string) => void}) {
  const [permission, requestPermission] = useCameraPermissions();
  // onBarcodeScanned fires for every frame the code is visible. A ref guard
  // stops the handler from running dozens of times before state updates.
  const handled = useRef(false);

  if (!permission?.granted) {
    return <Button title="Allow camera" onPress={requestPermission} />;
  }

  function onScanned(result: BarcodeScanningResult) {
    if (handled.current) {
      return;
    }
    handled.current = true;
    onTicket(result.data);
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={styles.fill}
        barcodeScannerSettings={{barcodeTypes: ['qr']}}
        onBarcodeScanned={onScanned}
      />
    </View>
  );
}

const styles = StyleSheet.create({fill: {flex: 1}});
```

## Performance considerations

- **Lower `quality`** on picker and camera captures. Full-resolution photos are several megabytes each and
  slow down uploads and rendering.
- **Avoid `base64: true`.** It holds the whole image in JS memory as a string. Upload the file URI.
- **Unmount or deactivate the camera** when its screen is not visible; a running preview drains battery.
- **Display picked images with [`expo-image`](images.md)**, which caches and downsamples.

## Security considerations

### Photos leak location

**Threat.** A photo the user uploads carries EXIF GPS coordinates, revealing where they live.

**Exploit.** Request `exif: true`, then read the location straight out of the result:

```ts title=lib/exifLeak.ts
import * as ImagePicker from 'expo-image-picker';

export async function showWhatLeaks(): Promise<void> {
  const result = await ImagePicker.launchImageLibraryAsync({mediaTypes: ['images'], exif: true});
  if (!result.canceled) {
    // On many photos this contains GPSLatitude / GPSLongitude.
    console.log(result.assets[0].exif);
  }
}
```

Even without `exif: true`, the original file you upload may still contain the metadata.

**Fix.** Do not request EXIF unless you need it, and strip metadata **on your server** before storing or
serving any user-uploaded image. Treat client-side stripping as a convenience, not a control.

**Verification.** Upload a photo taken with location services on, download it back from your service, and
run `exiftool downloaded.jpg | grep -i gps`. It must print nothing.

### Ask for the least access

Every permission you request is a prompt the user can refuse and a line App Review questions. Prefer the
picker over library read access, `requestPermissionsAsync(true)` (write-only) for saves, and block
permissions you do not use with `microphonePermission: false` and `recordAudioAndroid: false`. See
[Permissions Hygiene](../expo-security/permissions-hygiene.md).

## Common mistakes

- **Adding `expo-camera` without its config plugin.** iOS crashes on first use with no error. Add the plugin
  and rebuild.
- **Requesting media-library permission to pick one photo.** Use `launchImageLibraryAsync`; on iOS it needs
  no permission.
- **Reading `result.assets` without checking `canceled`.** `assets` is `null` when the user cancels.
- **Calling `takePictureAsync` before `onCameraReady`.** Wait for the callback.
- **Two mounted `CameraView`s.** Only one preview can be active; unmount on blur.
- **Handling `onBarcodeScanned` without a guard.** It fires repeatedly for the same code.
- **Calling `MediaLibrary.saveToLibraryAsync`.** It is deprecated and throws in SDK 57. Use `Asset.create`.
- **Using `MediaTypeOptions.Images`.** Deprecated; pass `['images']`.
- **Testing usage strings in Expo Go.** You see Expo Go's text. Verify yours in a development build.
- **Uploading photos with EXIF intact.** Strip GPS metadata server-side.

## Related topics

- [Images with expo-image](images.md) — displaying what you captured or picked.
- [File System and Storage](file-system-and-storage.md) — moving captured files out of the cache.
- [Audio and Video](audio-and-video.md) — playing back recorded video.
- [Permissions Patterns](permissions-patterns.md) — the request, denial and Settings flow.
- [Permissions Hygiene](../expo-security/permissions-hygiene.md) — requesting only what you use.
- [What a Config Plugin Is](../expo-config-plugins/what-they-are.md) — how usage strings reach `Info.plist`.
