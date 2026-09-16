import {isRunningInExpoGo, requireOptionalNativeModule} from 'expo';
import {StatusBar} from 'expo-status-bar';
import {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

/**
 * Proves why Expo Go is not enough.
 *
 * react-native-mmkv 4 is built on Nitro Modules — custom native code that is not
 * in the SDK 57 version map and not inside Expo Go. Expo Go's binary is fixed:
 * it cannot gain native code from your package.json. So this app:
 *
 *   - in Expo Go: explains that a development build is required
 *   - in a development build (expo-dev-client) or a release build: uses MMKV
 *
 * MMKV is required lazily because importing it where its native side is absent
 * throws during module initialisation — the app would crash before rendering
 * anything useful.
 *
 * The check asks whether Nitro's native module is actually linked, rather than
 * using `Constants.executionEnvironment === 'storeClient'`, which is also true in
 * a development build and would wrongly block the one environment that works.
 */
const nitroIsLinked = requireOptionalNativeModule('NitroModules') !== null;

type MMKVExports = typeof import('react-native-mmkv');

const mmkv: MMKVExports | null = nitroIsLinked
  ? (require('react-native-mmkv') as MMKVExports)
  : null;

const storage = mmkv ? mmkv.createMMKV({id: 'expo-dev-build-example'}) : null;

export default function App() {
  const [count, setCount] = useState(() => storage?.getNumber('taps') ?? 0);

  if (!storage) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Development build required</Text>
        <Text style={styles.body}>
          {isRunningInExpoGo()
            ? 'Expo Go cannot load react-native-mmkv: it contains custom native code that is not part of the Expo Go binary.'
            : 'The Nitro Modules native code is not linked into this binary.'}
        </Text>
        <Text style={styles.code}>npx expo run:android</Text>
        <Text style={styles.body}>then start the dev server with `npm start`.</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Running in a development build</Text>
      <Text style={styles.body}>
        This count is stored with react-native-mmkv, synchronously, and survives an app restart.
      </Text>
      <Text style={styles.count}>{count}</Text>
      <Pressable
        accessibilityRole="button"
        style={styles.button}
        onPress={() => {
          const next = count + 1;
          storage.set('taps', next);
          setCount(next);
        }}>
        <Text style={styles.buttonText}>Tap</Text>
      </Pressable>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12},
  title: {fontSize: 20, fontWeight: '700', textAlign: 'center'},
  body: {fontSize: 15, textAlign: 'center', lineHeight: 22},
  code: {fontFamily: 'monospace', fontSize: 15, backgroundColor: '#f1f3f5', padding: 8, borderRadius: 6},
  count: {fontSize: 48, fontWeight: '700'},
  button: {backgroundColor: '#0a58ca', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 28},
  buttonText: {color: '#fff', fontWeight: '600', fontSize: 16},
});
