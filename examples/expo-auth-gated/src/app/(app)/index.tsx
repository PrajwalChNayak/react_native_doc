import {Pressable, StyleSheet, Text, View} from 'react-native';

import {useSession} from '@/lib/SessionContext';

export default function HomeScreen() {
  const {session, signOut} = useSession();

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Signed in</Text>
      {session ? (
        <Text style={styles.meta}>
          Token expires {new Date(session.expiresAt).toLocaleTimeString()}
        </Text>
      ) : null}
      <Pressable accessibilityRole="button" onPress={signOut} style={styles.button}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24},
  title: {fontSize: 22, fontWeight: '700'},
  meta: {fontSize: 15, color: '#5b6570'},
  button: {backgroundColor: '#eef1f4', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20},
  buttonText: {fontWeight: '600', color: '#41505f'},
});
