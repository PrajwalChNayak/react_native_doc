import {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {useSession} from '@/lib/SessionContext';

/**
 * No navigation call after signing in. Updating the session flips the
 * `Stack.Protected` guards in the root layout, and the router moves to `(app)`
 * on its own. Navigating manually here as well is a common source of double
 * transitions.
 */
export default function SignInScreen() {
  const {signIn} = useSession();
  const [busy, setBusy] = useState(false);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Sign in</Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await signIn();
          } finally {
            setBusy(false);
          }
        }}
        style={[styles.button, busy && styles.disabled]}>
        <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in (demo)'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24},
  title: {fontSize: 22, fontWeight: '700'},
  button: {backgroundColor: '#0a58ca', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24},
  disabled: {opacity: 0.6},
  buttonText: {color: '#fff', fontWeight: '600', fontSize: 16},
});
