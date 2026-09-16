---
title: Camera
description: Capturing photos and video with react-native-vision-camera 5, including the permissions, native configuration, device selection and frame-processor constraints.
status: current
toolchain: cli
---

React Native core has no camera. There is no `Camera` export, no `ImagePicker`, nothing that
opens a capture session — the entire surface comes from a third-party native module.

The one worth building on is **`react-native-vision-camera` 5.2.3**. Version 5 is a rewrite on
top of Nitro Modules, which means it is New Architecture only by construction: there is no
legacy-bridge code path to fall back to, and nothing to check before you adopt it on 0.87.

## Why it exists — and when NOT to use it

VisionCamera gives you the capture session itself: device enumeration, preview, photo and video
outputs, focus, zoom, torch, and a frame stream you can run code against. That is the right
tool when the camera **is** the feature — a scanner, a document capture flow, a video recorder,
anything with a live preview.

It is the wrong tool when you only need "let the user pick or take a picture". If a system
photo picker would do, use one: it needs no camera permission at all on iOS, it is a smaller
dependency, and it is a smaller attack surface. Opening a full capture session to take one
avatar photo is a large amount of native code for a small amount of product.

> [!NOTE] Version 5 is not version 4
> The v4 API — `useCameraDevice` returning a device with a `formats` array, `useFrameProcessor`,
> `camera.current.takePhoto()` — was replaced. In v5 you compose **outputs** (`usePhotoOutput`,
> `useVideoOutput`, `useFrameOutput`) and pass them to the camera. Almost every tutorial and
> answer you will find online describes v4 or earlier.

## Installation

VisionCamera Core depends on Nitro. Both peers are required, and both need a native rebuild:

:::tabs
@tab npm
```bash
npm install react-native-vision-camera react-native-nitro-modules react-native-nitro-image
cd ios && bundle exec pod install
```
@tab yarn
```bash
yarn add react-native-vision-camera react-native-nitro-modules react-native-nitro-image
cd ios && bundle exec pod install
```
@tab pnpm
```bash
pnpm add react-native-vision-camera react-native-nitro-modules react-native-nitro-image
cd ios && bundle exec pod install
```
:::

Verified from the published package: `react-native-vision-camera@5.2.3` declares peers on
`react`, `react-native`, `react-native-nitro-modules` and `react-native-nitro-image`
(`react-native-nitro-image@0.15.2` at time of writing).

## Native configuration

This is the step that decides whether you get a dialog or a crash.

:::tabs
@tab iOS

Add a usage description for every capability you actually use. The camera one is mandatory;
the microphone one is only needed if you record video with audio.

```xml title=ios/AwesomeProject/Info.plist
<key>NSCameraUsageDescription</key>
<string>Used to scan documents. Images stay on your device unless you upload them.</string>

<!-- Only if you record video with sound. -->
<key>NSMicrophoneUsageDescription</key>
<string>Used to record sound with your videos.</string>

<!-- Only if you tag captures with a location. -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>Used to tag photos with where they were taken.</string>
```

Omitting `NSCameraUsageDescription` does **not** produce a denied permission. iOS kills the
process the instant the camera is accessed, before any JavaScript error handler can run.

@tab Android

Declare the permissions in the manifest. VisionCamera's own manifest already merges in
`<uses-feature android:name="android.hardware.camera" android:required="false" />`, which keeps
your app installable on devices with no camera — do not override it to `required="true"` unless
the app is genuinely useless without one.

```xml title=android/app/src/main/AndroidManifest.xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

  <uses-permission android:name="android.permission.CAMERA" />

  <!-- Only if you record video with sound. -->
  <uses-permission android:name="android.permission.RECORD_AUDIO" />

  <application ...>
    <!-- … -->
  </application>
</manifest>
```

An undeclared `CAMERA` permission is silently treated as denied: the request resolves without
ever showing a dialog.

:::

## Basic example

```tsx-fragment title=src/screens/CameraScreen.tsx
import {useEffect, useRef} from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import type {CameraRef} from 'react-native-vision-camera';

export function CameraScreen() {
  const {hasPermission, canRequestPermission, requestPermission} = useCameraPermission();
  // 'back' | 'front'. Returns undefined while devices are still enumerating,
  // and on a device that has no camera at that position.
  const device = useCameraDevice('back');
  const photoOutput = usePhotoOutput();
  const camera = useRef<CameraRef>(null);

  useEffect(() => {
    // Only ask when asking can still do something. Once the status is 'denied'
    // the prompt will not appear again.
    if (!hasPermission && canRequestPermission) {
      void requestPermission();
    }
  }, [hasPermission, canRequestPermission, requestPermission]);

  if (!hasPermission) {
    return <Text>Camera access is required to scan.</Text>;
  }
  if (device == null) {
    return <Text>No camera available on this device.</Text>;
  }

  const capture = async () => {
    const photo = await photoOutput.capturePhoto({flashMode: 'auto'}, {});
    const path = await photo.saveToTemporaryFileAsync();
    // Native resources are reference-counted. Release the photo as soon as the
    // bytes you need are somewhere else, or memory climbs with every shot.
    photo.dispose();
    console.log('saved', path);
  };

  return (
    <View style={styles.wrap}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        outputs={[photoOutput]}
        isActive={true}
      />
      <Pressable style={styles.shutter} onPress={capture} accessibilityRole="button">
        <Text>Capture</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1},
  shutter: {position: 'absolute', bottom: 48, alignSelf: 'center', padding: 16},
});
```

> [!NOTE] Why this block is not type-checked
> `react-native-vision-camera` is not installed in this repository's type-check harness, so the
> block is tagged `tsx-fragment`. The API shown was read from the published `5.2.3` sources.

## How it works

### Permissions have their own vocabulary here

VisionCamera exposes `useCameraPermission()` and `useMicrophonePermission()`, each returning
`{status, hasPermission, canRequestPermission, requestPermission}`. The underlying `status` is
one of:

| Status | Meaning |
| --- | --- |
| `not-determined` | Never asked. On Android, also "refused once without don't-ask-again" |
| `authorized` | Granted |
| `denied` | Refused. Requesting again does nothing — only Settings can change it |
| `restricted` | Blocked by policy such as parental controls; cannot be requested |

`canRequestPermission` is true only for `not-determined`. That is the guard to branch on; see
[Permissions](permissions.md) for the settings-redirect flow when it is false.

If you already use `react-native-permissions` elsewhere, you can drive the camera permission
through it instead and keep one vocabulary across the app. The hooks re-read the status when
the app returns to the foreground, which is what makes a round trip to Settings work.

### Devices, not cameras

`useCameraDevice(position, filter?)` returns the best `CameraDevice` at `'back'` or `'front'`,
or `undefined`. A modern phone exposes several physical cameras on one side plus **virtual**
devices that combine them and switch between them as you zoom.

```tsx-fragment title=Picking a simpler device on purpose
import {useCameraDevice} from 'react-native-vision-camera';

// A single physical lens: fewer capabilities, but noticeably faster to open.
const fast = useCameraDevice('back', {physicalDevices: ['wide-angle']});

// A virtual device spanning three lenses: smooth 0.5x/1x/2x zoom, slower start-up.
const zoomable = useCameraDevice('back', {
  physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'],
});
```

The filter **ranks** devices, it does not exclude them. If nothing matches, you still get the
closest device rather than `undefined` — so do not treat a returned device as proof that your
filter was satisfied. Read `device.physicalDevices` and `device.type` if it matters.

Useful fields on a `CameraDevice`: `id`, `localizedName`, `position`, `type`, `isVirtualDevice`,
`physicalDevices`, `supportedPixelFormats`, `supportedFPSRanges`, `supportsPhotoHDR`,
`supportedVideoDynamicRanges`, and the methods `getSupportedResolutions(outputStreamType)`,
`supportsFPS(fps)` and `supportsOutput(output)`.

### Formats are constraints, not a list you pick from

Version 4 made you search a `formats` array and pick one. Version 5 inverts it: you declare
what you want as `constraints`, and the session resolves them against the device.

```tsx-fragment title=Asking for 60fps and telling the user what you got
import {Camera, CommonResolutions, usePhotoOutput, useCameraDevice} from 'react-native-vision-camera';
import type {CameraSessionConfig} from 'react-native-vision-camera';

function Recorder() {
  const device = useCameraDevice('back');
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.UHD_4_3,
    qualityPrioritization: 'quality',
  });

  if (device == null) return null;

  return (
    <Camera
      style={{flex: 1}}
      device={device}
      outputs={[photoOutput]}
      isActive={true}
      constraints={[{fps: 60}, {photoHDR: true}]}
      // Fires once the constraints have been resolved into a real configuration.
      onSessionConfigSelected={(config: CameraSessionConfig) => {
        console.log('negotiated', config);
      }}
    />
  );
}
```

Constraint shapes available in 5.2.3: `{fps}`, `{videoStabilizationMode}`,
`{previewStabilizationMode}`, `{resolutionBias}`, `{videoDynamicRange}`, `{photoHDR}`,
`{pixelFormat}` and `{binned}`. A constraint is a preference — the session picks the closest
supported configuration and reports it through `onSessionConfigSelected`, so read that callback
rather than assuming you got what you asked for.

### Outputs compose

The `<Camera>` component always creates a preview output for itself. Anything else you want —
photos, video, a frame stream — is a separate output object you create with a hook and pass in:

| Hook | Output | Notes |
| --- | --- | --- |
| `usePhotoOutput` | `CameraPhotoOutput` | `capturePhoto(settings, callbacks)`, `capturePhotoToFile(...)` |
| `useVideoOutput` | `CameraVideoOutput` | Recording, bit rate, file type, optional audio |
| `useFrameOutput` | `CameraFrameOutput` | Per-frame callback — see below |
| `usePreviewOutput` | `CameraPreviewOutput` | Only needed if you build your own preview view |

A captured `Photo` is a native object with `width`, `height`, `orientation`, `containerFormat`
and methods including `saveToFileAsync(path)`, `saveToTemporaryFileAsync()`,
`getFileDataAsync()` and `toImageAsync()`. It holds native memory: call `photo.dispose()` when
you are finished with it.

### Frame processors need two more packages

A frame processor is a JavaScript function that runs for **every frame**, on the camera's own
thread, as a worklet. That requires a worklet runtime, which VisionCamera Core does not bundle.

You need `react-native-vision-camera-worklets` (published at 5.2.3, matching the core version)
and `react-native-worklets` — the same worklets runtime Reanimated 4 depends on, covered in
[Worklets](../animation/worklets.md).

```tsx-fragment title=A frame processor, with the disposal rule that matters
import {useFrameOutput} from 'react-native-vision-camera';

const frameOutput = useFrameOutput({
  pixelFormat: 'yuv',
  onFrame(frame) {
    'worklet';
    // …inspect the frame here…

    // Frames come from a fixed buffer pool. Not disposing stalls the pipeline
    // and every subsequent frame is dropped.
    frame.dispose();
  },
  onFrameDropped(reason) {
    console.warn('dropped frame:', reason);
  },
});
```

Pixel format matters more than it looks. `'yuv'` is what the camera produces natively and what
most vision libraries consume; `'rgb'` costs a conversion and roughly 2.6x the bandwidth. Pick
`'rgb'` only when the consumer genuinely requires it.

If your processing is slower than a frame interval, do not block — hand the work to an
`AsyncRunner` and drop the frame when it reports busy. `onFrameDropped` receiving
`'out-of-buffers'` means exactly that: your callback is too slow.

## Platform differences

:::tabs
@tab iOS

- The permission dialog appears once. After a denial the status is `denied` permanently and
  `requestPermission()` resolves without showing anything.
- Virtual devices (`dual`, `triple`) are common and are how smooth zoom across lenses works.
  Choosing one costs start-up time.
- The shutter sound can be suppressed via `enableShutterSound: false` in `CapturePhotoSettings`,
  but some regions mandate it at the OS level regardless.
- `onSubjectAreaChanged` is iOS-only; it is the signal to reset a locked focus back to
  continuous auto-focus.

@tab Android

- The camera stack is CameraX/Camera2 underneath, and device variability is much wider.
  Capability checks (`supportsFPS`, `getSupportedResolutions`) are not optional here.
- A refusal that is not "don't ask again" leaves the status at `not-determined`, so
  `canRequestPermission` stays true and you can ask a second time.
- Recording video with audio requires `RECORD_AUDIO` in the manifest **and** at runtime; the
  camera permission does not cover it.
- Emulators frequently report a camera that produces a synthetic image or none at all. Test
  capture on hardware.

:::

## Performance considerations

- **`isActive` is the power switch.** Set it to `false` when the screen is not focused. An
  active session holds the sensor open and drains battery quickly; leaving it running behind a
  navigation push is the most common camera performance bug.
- **Dispose native objects.** `Photo` and `Frame` hold native buffers. Every missed `dispose()`
  is a leak that the JS heap profiler will not show you.
- **Prefer the simplest device that works.** A single `wide-angle` device opens measurably
  faster than a virtual triple-camera device. If you do not offer zoom across lenses, do not
  pay for it.
- **Keep the frame processor short.** It runs per frame on the camera thread. Downscale via
  `targetResolution`, use `'yuv'`, and move heavy work to an async runner.
- **Do not re-create outputs every render.** The hooks memoize on their options; passing a new
  inline object with a fresh identity each render tears down and rebuilds the output.

## Security considerations

**Threat.** Camera access is a capability the whole process holds, not just the screen that
asked for it. Once granted, any code running in your app — including a compromised dependency —
can open a session. The secondary threat is what happens to the bytes afterwards: captured
images routinely contain faces, documents, card numbers and, if location tagging is on, precise
coordinates in EXIF.

**Exploit.** Photos written to shared or backed-up storage leave the app's control. On Android,
anything under the external storage directories is readable by other apps with storage access
and is included in cloud backups by default. A quick demonstration on a debuggable build:

```bash
# List what the app has written where other apps can reach it.
adb shell run-as com.awesomeproject ls -R /sdcard/Android/data/com.awesomeproject/files
```

An image saved there, containing a scanned ID and GPS EXIF, is now outside your threat model.

**Fix.** Three habits, in order of value:

1. **Keep captures in app-private storage.** `photo.saveToTemporaryFileAsync()` writes to a
   private temporary location. If you need a durable path, write inside the app sandbox — see
   [File System](file-system.md) — never to shared media directories unless the user explicitly
   asked you to save to their gallery.
2. **Do not attach a location unless the feature needs it.** `CapturePhotoSettings.location` is
   opt-in; leave it unset and no coordinates are embedded. If you do set it, say so in the UI.
3. **Delete aggressively.** Unlink temporary captures once uploaded or discarded, including on
   the failure paths. A retry loop that leaves a file behind on every attempt accumulates
   sensitive images.

**Verification.** After running your capture flow, enumerate what is on disk and confirm the
files are where you think and gone when they should be:

```bash
adb shell run-as com.awesomeproject find . -name "*.jpg"
```

On iOS, use the Devices and Simulators window in Xcode to download the app container and look
through `tmp/` and `Documents/`. Then re-run the flow, cancel halfway, and look again — the
cancellation path is where the leftovers live.

## Common mistakes

- **Copying a v4 example.** Wrong: `const format = device.formats.find(...)` or
  `camera.current.takePhoto()`. Right: v5 uses `constraints` plus output objects. The old API
  does not exist in 5.2.3, so these fail at import or at type-check rather than subtly.
- **Leaving `isActive` true.** Wrong: rendering the camera on a screen that stays mounted under
  a navigation stack. Right: tie `isActive` to screen focus. The user sees the battery drain,
  not the bug.
- **Not disposing.** Wrong: capturing in a loop and keeping the `Photo` objects. Right: call
  `photo.dispose()` after extracting what you need; call `frame.dispose()` in every branch of a
  frame processor, including the early returns.
- **Assuming the constraint was honoured.** Wrong: requesting `{fps: 60}` and rendering a UI
  that says "60fps". Right: read `onSessionConfigSelected` — constraints are preferences that
  get resolved against the device.
- **Requesting the microphone because the camera page said so.** Wrong: adding
  `NSMicrophoneUsageDescription` and `RECORD_AUDIO` to a photo-only app. Right: declare only the
  capability you use; an unused microphone permission is review friction and a real capability
  an attacker inherits.
- **Testing only on a simulator.** Wrong: assuming device enumeration works because the
  simulator returned something. Right: device selection, formats and frame rates only mean
  anything on hardware.

## Related topics

- [Permissions](permissions.md) — the check/request/blocked flow this page depends on.
- [File System](file-system.md) — where captured images should and should not be written.
- [Geolocation](geolocation.md) — if you tag captures with coordinates.
- [Worklets](../animation/worklets.md) — the runtime frame processors run on.
- [Native Dependency Compatibility](../migration/native-dependency-compatibility.md) — judging whether a native library is safe to adopt.
- [Threat Model](../security/threat-model.md) — what a granted capability means once the app is compromised.
