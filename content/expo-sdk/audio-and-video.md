---
title: Audio and Video
description: Playing and recording audio with expo-audio and playing video with expo-video in Expo SDK 57 — players, recording, the audio session, background playback and Picture in Picture. expo-av is legacy and not in SDK 57.
status: current
toolchain: expo
sdk: 57
---

Expo SDK 57 splits media into two packages built on the same pattern — a **player object** you create
with a hook, and state you observe through events:

| Package | SDK 57 | Covers |
| --- | --- | --- |
| `expo-audio` | `~57.0.5` | Audio playback, playlists, recording, the audio session, lock-screen controls. |
| `expo-video` | `~57.0.4` | Video playback, native controls, fullscreen, Picture in Picture, background playback. |

```bash
npx expo install expo-audio expo-video
```

Install only what you use. See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

> [!LEGACY] expo-av
> `expo-av` — with `Audio.Sound.createAsync`, `Audio.Recording` and the `<Video>` component — is **not in
> the SDK 57 bundled module map**. `npx expo install` has no SDK 57 version to resolve for it. Its
> successors are `expo-audio` and `expo-video`, whose APIs are different: there is no `Sound` object and
> no `<Video>` component. Tutorials that call `Audio.Sound.createAsync` are describing the old package.
> Migrate rather than pinning an old version.

## Why it exists / when to use it — and when NOT to

Use `expo-audio` for sound effects, music and podcasts, voice notes and recording. Use `expo-video` for
any video, from a looping background clip to a full player with subtitles.

Do **not** use them for:

- **Real-time calls.** Voice and video calling need a WebRTC-style stack with echo cancellation and
  network jitter handling; neither package is that.
- **Low-latency audio synthesis or games that need sample-accurate timing.** Playback is buffered through
  the platform media stack.
- **Showing a video thumbnail in a list.** Render a poster image with [`expo-image`](images.md); mounting
  dozens of players is expensive.

## Expo Go vs development build

**Both packages are included in Expo Go** for basic playback and recording.

A [development build](../expo-development-builds/why-you-need-one.md) is required for anything driven by
the config plugins: your own `NSMicrophoneUsageDescription` text, background audio (`UIBackgroundModes`
`audio` and the Android foreground services), and Picture in Picture. Expo's video documentation also
notes that some native features, such as asset interception, are unavailable in Expo Go. If background
playback or PiP "does nothing", check that you are not in Expo Go before debugging anything else.

## Basic example

Play a bundled sound:

```tsx title=components/ChimeButton.tsx
import {useAudioPlayer} from 'expo-audio';
import {Button} from 'react-native';

const chime = require('../assets/sounds/chime.mp3');

export function ChimeButton() {
  // The hook creates the player and releases it when the component unmounts.
  const player = useAudioPlayer(chime);

  return (
    <Button
      title="Play"
      onPress={() => {
        // A finished player stays at the end. Rewind before replaying.
        player.seekTo(0);
        player.play();
      }}
    />
  );
}
```

Play a video:

```tsx title=components/IntroVideo.tsx
import {useEvent} from 'expo';
import {useVideoPlayer, VideoView} from 'expo-video';
import {Button, StyleSheet, View} from 'react-native';

const source = 'https://example.com/media/intro.m3u8';

export function IntroVideo() {
  const player = useVideoPlayer(source, (p) => {
    // The setup callback runs once, when the player is created.
    p.loop = true;
  });

  // useEvent re-renders only when this event fires, with a typed payload.
  const {isPlaying} = useEvent(player, 'playingChange', {isPlaying: player.playing});

  return (
    <View>
      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls />
      <Button
        title={isPlaying ? 'Pause' : 'Play'}
        onPress={() => (isPlaying ? player.pause() : player.play())}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  video: {width: '100%', aspectRatio: 16 / 9},
});
```

## How it works

### Players are objects, not components

In both packages the player is a native shared object and the view (if any) only displays it. That
separation is why a video can keep playing while its `VideoView` moves between screens, and why you
control playback by calling methods rather than changing props.

| Create with | Lifetime |
| --- | --- |
| `useAudioPlayer(source)` / `useVideoPlayer(source, setup?)` | Released automatically on unmount. **Use these by default.** |
| `createAudioPlayer(source)` / `createVideoPlayer(source)` | Yours to manage. Call `remove()` (audio) or `release()` (video) or you leak a native player. |

### `expo-audio` playback

`AudioSource` is a `require()` asset, a URL string, or `{uri, headers?}`.

| `AudioPlayer` member | Meaning |
| --- | --- |
| `play()` / `pause()` | Start and stop. |
| `seekTo(seconds)` | Jump; returns a promise. |
| `replace(source)` | Swap the source without creating a new player. |
| `volume`, `muted`, `loop` | Settable properties. |
| `setPlaybackRate(rate)` | Speed, with optional pitch correction quality. |
| `playing`, `currentTime`, `duration`, `isLoaded`, `isBuffering` | Read-only state. |
| `setActiveForLockScreen(active, metadata?)` | Lock-screen / notification controls. |

Properties on the player object are not React state. To re-render on changes, use
`useAudioPlayerStatus(player)`, which returns an `AudioStatus` including `playing`, `currentTime`,
`duration`, `isLoaded` and `didJustFinish`.

```tsx title=components/EpisodePlayer.tsx
import {useAudioPlayer, useAudioPlayerStatus} from 'expo-audio';
import {Button, Text, View} from 'react-native';

export function EpisodePlayer({url}: {url: string}) {
  const player = useAudioPlayer({uri: url});
  const status = useAudioPlayerStatus(player);

  return (
    <View>
      <Text>
        {Math.floor(status.currentTime)}s / {Math.floor(status.duration)}s
      </Text>
      <Button
        title={status.playing ? 'Pause' : 'Play'}
        disabled={!status.isLoaded}
        onPress={() => (status.playing ? player.pause() : player.play())}
      />
      <Button title="Back 15s" onPress={() => player.seekTo(Math.max(0, status.currentTime - 15))} />
    </View>
  );
}
```

### The audio session

`setAudioModeAsync(mode)` configures how your app's audio interacts with the device and other apps. It
takes a partial `AudioMode`:

| Field | Meaning |
| --- | --- |
| `playsInSilentMode` | iOS: play even with the ring/silent switch on silent. |
| `interruptionMode` | `'mixWithOthers'`, `'doNotMix'` or `'duckOthers'`. |
| `allowsRecording` | Enables recording (on iOS this changes the session category). |
| `shouldPlayInBackground` | Keep playing when the app is backgrounded (also needs native config). |
| `shouldRouteThroughEarpiece` | Route output to the earpiece instead of the speaker. |

Set it once at startup, and again only when switching between playback and recording.

### Recording

```tsx title=components/VoiceNote.tsx
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import {Button, Text, View} from 'react-native';

export function VoiceNote({onSaved}: {onSaved: (uri: string) => void}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);

  async function start() {
    const {granted} = await requestRecordingPermissionsAsync();
    if (!granted) {
      return;
    }
    await setAudioModeAsync({allowsRecording: true, playsInSilentMode: true});
    // Preparing is a separate, required step before record().
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function stop() {
    await recorder.stop();
    // Switch the session back so later playback uses the speaker normally.
    await setAudioModeAsync({allowsRecording: false});
    if (recorder.uri) {
      onSaved(recorder.uri);
    }
  }

  return (
    <View>
      <Text>{state.isRecording ? `Recording ${Math.floor(state.durationMillis / 1000)}s` : 'Idle'}</Text>
      <Button title={state.isRecording ? 'Stop' : 'Record'} onPress={state.isRecording ? stop : start} />
    </View>
  );
}
```

`RecordingPresets.HIGH_QUALITY` and `LOW_QUALITY` are ready-made `RecordingOptions` (`.m4a`, 44.1 kHz,
two channels). The recording lands in the app's cache directory; move it with
[`expo-file-system`](file-system-and-storage.md) if it must persist.

### `expo-video`

| `VideoPlayer` member | Meaning |
| --- | --- |
| `play()` / `pause()` / `replay()` | Playback. |
| `seekBy(seconds)`, `currentTime` (settable) | Seeking. |
| `replaceAsync(source)` | Swap the source. |
| `loop`, `muted`, `volume`, `playbackRate` | Settable properties. |
| `status` | `'idle'`, `'loading'`, `'readyToPlay'`, `'error'`. |
| `staysActiveInBackground`, `showNowPlayingNotification` | Background behaviour; require native config. |
| `generateThumbnailsAsync(times)` | Frames at given times. |

A `VideoSource` is a URL string, a `require()` asset, or an object with `uri`, `headers`, `drm`,
`metadata` and `useCaching`.

Observe state with `useEvent(player, eventName, initialValue)` or `useEventListener(player, eventName,
listener)`, both imported from `expo`. Events include `statusChange`, `playingChange`, `timeUpdate`,
`playToEnd`, `volumeChange` and `sourceChange`.

| `VideoView` prop | Meaning |
| --- | --- |
| `player` | The player to display. |
| `nativeControls` | Show platform playback controls. |
| `contentFit` | `'contain'`, `'cover'` or `'fill'`. |
| `allowsPictureInPicture` | Offer PiP; needs the config plugin option. |
| `startsPictureInPictureAutomatically` | Enter PiP when the app backgrounds. |
| `fullscreenOptions` | Fullscreen behaviour. |
| `onFirstFrameRender` | Hide a poster once video is visible. |

## Native configuration

:::tabs
@tab iOS

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-audio",
        {
          "microphonePermission": "Record voice notes to send to your team.",
          "enableBackgroundPlayback": true,
          "enableBackgroundRecording": false
        }
      ],
      [
        "expo-video",
        {
          "supportsBackgroundPlayback": true,
          "supportsPictureInPicture": true
        }
      ]
    ]
  }
}
```

| Plugin option | Effect on iOS |
| --- | --- |
| `expo-audio` → `microphonePermission` | `NSMicrophoneUsageDescription` |
| `expo-audio` → `enableBackgroundPlayback` (default `true`) | Adds `audio` to `UIBackgroundModes` |
| `expo-audio` → `enableBackgroundRecording` (default `false`) | Adds `audio` to `UIBackgroundModes` |
| `expo-video` → `supportsBackgroundPlayback` | Adds `audio` to `UIBackgroundModes` |
| `expo-video` → `supportsPictureInPicture` | Adds `audio` to `UIBackgroundModes` (PiP needs it) |

> [!DANGER] Recording without `NSMicrophoneUsageDescription` is an instant crash
> Starting a recording when `Info.plist` lacks `NSMicrophoneUsageDescription` terminates the app with no
> JavaScript error. Keep the `expo-audio` plugin in `app.json` whenever you record.

Declaring `UIBackgroundModes` `audio` when you do not play audio in the background is a common App Review
rejection. If you only play foreground sound effects, set `enableBackgroundPlayback: false`.

@tab Android

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-audio",
        {
          "recordAudioAndroid": true,
          "enableBackgroundPlayback": true,
          "enableBackgroundRecording": false
        }
      ],
      [
        "expo-video",
        {
          "supportsBackgroundPlayback": true,
          "supportsPictureInPicture": true
        }
      ]
    ]
  }
}
```

| Plugin option | Effect on Android |
| --- | --- |
| `expo-audio` → *(always)* | `MODIFY_AUDIO_SETTINGS` |
| `expo-audio` → `recordAudioAndroid` (default `true`) | `RECORD_AUDIO` |
| `expo-audio` → `enableBackgroundPlayback` | `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, and a `mediaPlayback` service |
| `expo-audio` → `enableBackgroundRecording` | `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS`, and a `microphone` service |
| `expo-video` → `supportsBackgroundPlayback` | `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, and a `mediaPlayback` service |
| `expo-video` → `supportsPictureInPicture` | `android:supportsPictureInPicture="true"` on the main activity |

If your app never records, set `recordAudioAndroid: false` so `RECORD_AUDIO` is not requested. Google
Play asks you to justify foreground-service types, so enable the background options only when used.
:::

## Platform differences

| Concern | iOS | Android |
| --- | --- | --- |
| Silent switch | Mutes playback unless `playsInSilentMode: true` | No equivalent |
| Background audio | `UIBackgroundModes` `audio` | Foreground service; Expo's docs note that without lock-screen controls (`setActiveForLockScreen`) background audio stops after about three minutes |
| Picture in Picture | Supported | Supported on the activity via the plugin |
| Media engine | AVFoundation | Media3 / ExoPlayer |
| Recording format with presets | `.m4a` | `.m4a` |

## Common patterns

### Background audio with lock-screen controls

```ts title=lib/podcastSession.ts
import {createAudioPlayer, setAudioModeAsync, type AudioPlayer} from 'expo-audio';

let player: AudioPlayer | null = null;

export async function startEpisode(url: string, title: string): Promise<void> {
  await setAudioModeAsync({playsInSilentMode: true, shouldPlayInBackground: true});

  // A player that outlives any one screen is created manually, so its
  // lifetime is ours to manage.
  player?.remove();
  player = createAudioPlayer({uri: url});
  // Required on Android for sustained background playback.
  player.setActiveForLockScreen(true, {title, artist: 'My Podcast'});
  player.play();
}

export function stopEpisode(): void {
  player?.clearLockScreenControls();
  player?.remove();
  player = null;
}
```

### Hiding a poster until the first frame

Render an `expo-image` poster over the `VideoView`, and remove it in `onFirstFrameRender`. It avoids a
black rectangle while the stream buffers.

## Performance considerations

- **Do not mount a player per list row.** Show a poster and create the player only for the focused item.
- **Pause and release** players for screens that are not visible; a playing hidden video still decodes.
- **Use HLS (`.m3u8`) for long video** so the player adapts bitrate to the network.
- **Keep `timeUpdateEventInterval` coarse** (the default is fine); frequent `timeUpdate` events re-render.
- **Prefer `useAudioPlayerStatus` over polling** player properties with a timer.

## Security considerations

### Microphone access

**Threat.** Recording is among the most privacy-sensitive capabilities an app has. Users and reviewers
notice a microphone permission the app does not visibly need, and continued recording in the background
is exactly what they fear.

**Fix.**

- Request `RECORD_AUDIO` / `NSMicrophoneUsageDescription` only if you record; set `recordAudioAndroid:
  false` otherwise. Note that `expo-camera` and `expo-image-picker` add microphone permissions by default
  too — see [Camera and Media](camera-and-media.md).
- Keep `enableBackgroundRecording: false` unless background recording is the feature.
- Request the permission at the moment the user taps Record, with context.

**Verification.** Build a release, then inspect the merged manifest:

```bash
npx expo prebuild --platform android --clean
grep -n "RECORD_AUDIO" android/app/src/main/AndroidManifest.xml
```

It must print nothing for an app that does not record.

> [!DANGER] `expo prebuild --clean` deletes the native directories
> In SDK 57 `expo prebuild` regenerates `android/` and `ios/` from scratch. Run the check above only in a
> project that follows Continuous Native Generation, or in a throwaway copy. See
> [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).

### Authenticated media URLs

Passing `headers: {Authorization: ...}` in a video or audio source sends that token to the media host on
every request. Prefer short-lived signed URLs issued by your server over long-lived bearer tokens baked
into the source, and never embed a permanent API key in the app.

## Common mistakes

- **Following an `expo-av` tutorial.** `Audio.Sound.createAsync` and `<Video>` are the legacy package, not in
  SDK 57. Use `useAudioPlayer` and `useVideoPlayer` + `VideoView`.
- **Replaying without rewinding.** A finished audio player stays at the end; call `seekTo(0)` first.
- **Reading player properties in render.** They are not React state. Use `useAudioPlayerStatus` or
  `useEvent`.
- **Creating players with `createAudioPlayer` / `createVideoPlayer` and never releasing them.** Use the hooks,
  or call `remove()` / `release()`.
- **Recording without `prepareToRecordAsync()`.** Prepare, then `record()`.
- **Forgetting `allowsRecording: true`.** Recording fails or is silent on iOS.
- **Expecting background playback in Expo Go.** It needs the plugin options in a development build.
- **Background audio on Android without `setActiveForLockScreen`.** Playback stops after a few minutes.
- **Declaring background audio you do not use.** App Review and Play Console both question it.
- **Leaving `recordAudioAndroid` at its default in an app that never records.**

## Related topics

- [Camera and Media](camera-and-media.md) — recording video with `expo-camera`, and the microphone permission it adds.
- [Images with expo-image](images.md) — posters and thumbnails.
- [File System and Storage](file-system-and-storage.md) — keeping recordings after the cache is cleared.
- [Background Tasks](background-tasks.md) — what else the OS lets you do in the background.
- [Permissions Patterns](permissions-patterns.md) — asking for the microphone at the right moment.
- [What a Config Plugin Is](../expo-config-plugins/what-they-are.md) — why background options need a rebuild.
