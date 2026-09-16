import {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {clear, load, needsRefresh, save, type Session} from './src/tokenStore';

type Status = 'checking' | 'signed-out' | 'signed-in';

/**
 * Stands in for a real sign-in request. A real one posts to HTTPS and returns
 * a short-lived access token; it never returns anything derived from the
 * password, and the password is never stored.
 */
async function fakeSignIn(email: string): Promise<Session> {
  await new Promise<void>(resolve => setTimeout(() => resolve(), 400));
  return {
    accessToken: `access-${email}-${Date.now()}`,
    refreshToken: `refresh-${Date.now()}`,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
}

export default function App() {
  const [status, setStatus] = useState<Status>('checking');
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('ada@example.com');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore on launch. A keychain read is async and can fail, so the UI has a
  // real "checking" state rather than flashing the login screen first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const restored = await load();
        if (cancelled) return;
        if (restored && !needsRefresh(restored)) {
          setSession(restored);
          setStatus('signed-in');
        } else {
          if (restored) await clear();
          setStatus('signed-out');
        }
      } catch {
        if (!cancelled) setStatus('signed-out');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSignIn = useCallback(async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter an email and password.');
      return;
    }
    setBusy(true);
    try {
      const next = await fakeSignIn(email.trim());
      await save(next);
      // The password is dropped the moment it has been exchanged. It is never
      // stored, and never written to a log.
      setPassword('');
      setSession(next);
      setStatus('signed-in');
    } catch {
      setError('Could not sign in.');
    } finally {
      setBusy(false);
    }
  }, [email, password]);

  const onSignOut = useCallback(async () => {
    setBusy(true);
    try {
      await clear();
      setSession(null);
      setStatus('signed-out');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.body}>
          {status === 'checking' ? (
            <ActivityIndicator size="large" />
          ) : status === 'signed-in' && session ? (
            <View style={styles.card}>
              <Text style={styles.heading}>Signed in</Text>
              <Text style={styles.meta}>
                Token expires {new Date(session.expiresAt).toLocaleTimeString()}
              </Text>
              <Text style={styles.note}>
                The session lives in the Keychain or Keystore, not in
                AsyncStorage. Relaunch the app and it is restored.
              </Text>
              <Pressable
                onPress={onSignOut}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.button, styles.secondary, busy && styles.disabled]}>
                <Text style={styles.secondaryText}>Sign out</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.heading}>Sign in</Text>

              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                inputMode="email"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                style={styles.input}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                onSubmitEditing={onSignIn}
                returnKeyType="go"
              />

              {error ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : null}

              <Pressable
                onPress={onSignIn}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.button, busy && styles.disabled]}>
                <Text style={styles.buttonText}>
                  {busy ? 'Signing in…' : 'Sign in'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#f4f6f8'},
  body: {flex: 1, justifyContent: 'center', padding: 20},
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 22,
    elevation: 2,
    shadowColor: '#0b1220',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
  },
  heading: {fontSize: 22, fontWeight: '700', color: '#12161b', marginBottom: 14},
  label: {fontSize: 13, fontWeight: '600', color: '#41505f', marginBottom: 5},
  input: {
    borderWidth: 1,
    borderColor: '#c8ced6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#12161b',
    marginBottom: 14,
  },
  button: {
    marginTop: 6,
    backgroundColor: '#0a58ca',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondary: {backgroundColor: '#eef1f4'},
  secondaryText: {color: '#41505f', fontSize: 16, fontWeight: '600'},
  disabled: {opacity: 0.6},
  buttonText: {color: '#ffffff', fontSize: 16, fontWeight: '600'},
  meta: {fontSize: 14, color: '#41505f', marginBottom: 10},
  note: {fontSize: 14, lineHeight: 20, color: '#5b6570', marginBottom: 18},
  error: {fontSize: 13, color: '#b3261e', marginBottom: 8},
});
