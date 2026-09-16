import {StatusBar} from 'expo-status-bar';
import {useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';

/**
 * The smallest useful Expo SDK 57 app. Every other Expo example assumes you
 * have read this one.
 *
 * Note what is deliberately NOT here: no `ios/`, no `android/`. Under
 * Continuous Native Generation those directories are build output, produced by
 * `npx expo prebuild` or by the build itself. They are not source.
 */
export default function App() {
  const [name, setName] = useState('');
  const [greeting, setGreeting] = useState<string | null>(null);

  // SDK 57 ships React Native 0.86, where the per-component instance types
  // (`ViewInstance`, `TextInputInstance`, `HostInstance`) introduced in 0.87 do
  // NOT exist. Type a ref by the component itself. Copying the 0.87 form from
  // the CLI half of the handbook is a compile error here.
  const inputRef = useRef<TextInput | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Expo SDK 57</Text>
      <Text style={styles.subtitle}>React Native 0.86.3</Text>

      <TextInput
        ref={inputRef}
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        style={styles.input}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => setGreeting(name.trim() || 'world')}
      />

      <Pressable
        accessibilityRole="button"
        style={({pressed}) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => {
          setGreeting(name.trim() || 'world');
          inputRef.current?.blur();
        }}>
        <Text style={styles.buttonText}>Greet</Text>
      </Pressable>

      {greeting === null ? null : (
        <Text style={styles.greeting} accessibilityLiveRegion="polite">
          Hello, {greeting}.
        </Text>
      )}

      {/* expo-status-bar, not React Native's StatusBar. It handles the
          light/dark contrast for you and works the same on both platforms. */}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {fontSize: 24, fontWeight: '700'},
  subtitle: {fontSize: 15, color: '#5b6570', marginBottom: 12},
  input: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#c8ced6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#0a58ca',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonPressed: {backgroundColor: '#0846a6'},
  buttonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  greeting: {fontSize: 18, marginTop: 8},
});
