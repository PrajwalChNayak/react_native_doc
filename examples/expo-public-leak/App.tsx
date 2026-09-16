import {StatusBar} from 'expo-status-bar';
import {ScrollView, StyleSheet, Text, View} from 'react-native';

/**
 * Demonstrates what `EXPO_PUBLIC_*` actually does.
 *
 * These are not "environment variables" in the server sense. Metro performs a
 * TEXT SUBSTITUTION at build time: every `process.env.EXPO_PUBLIC_FOO` in your
 * source is replaced with the literal value before bundling. The value is then
 * a string constant inside the shipped binary.
 *
 * Run `npm run prove-leak` to see both values recovered from the built bundle.
 */

// Inlined at build time. Readable by anyone with the app binary.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const analyticsKey = process.env.EXPO_PUBLIC_ANALYTICS_KEY;

// NOT inlined: no EXPO_PUBLIC_ prefix. This is `undefined` on the client, which
// is correct — a real secret must never reach the bundle in the first place.
const serverOnly = process.env.SERVER_ONLY_SECRET;

export default function App() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>EXPO_PUBLIC_ is not a secret store</Text>

      <View style={styles.row}>
        <Text style={styles.label}>EXPO_PUBLIC_API_URL</Text>
        <Text style={styles.value}>{apiUrl ?? '(unset)'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>EXPO_PUBLIC_ANALYTICS_KEY</Text>
        <Text style={styles.value}>{analyticsKey ?? '(unset)'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>SERVER_ONLY_SECRET</Text>
        <Text style={styles.value}>
          {serverOnly ?? '(undefined — never inlined, which is the point)'}
        </Text>
      </View>

      <Text style={styles.note}>
        Both EXPO_PUBLIC_ values above are string constants inside the shipped
        binary. Run `npm run prove-leak` to recover them from the exported
        bundle without running the app.
      </Text>

      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {padding: 24, paddingTop: 72, gap: 16},
  title: {fontSize: 20, fontWeight: '700', marginBottom: 8},
  row: {gap: 4},
  label: {fontSize: 12, fontWeight: '600', color: '#5b6570'},
  value: {fontSize: 15, fontFamily: 'monospace'},
  note: {marginTop: 16, fontSize: 14, lineHeight: 20, color: '#41505f'},
});
