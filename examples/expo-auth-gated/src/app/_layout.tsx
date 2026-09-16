import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';

import {SessionProvider, useSession} from '@/lib/SessionContext';

/**
 * Auth gating happens here, in the layout, not in individual screens.
 *
 * `Stack.Protected` removes the routes inside it when `guard` is false, so a
 * signed-out user cannot reach `(app)` by any path — including a deep link
 * straight to a protected URL. Checking inside a screen and redirecting after
 * it mounts lets the protected screen render for a frame, and has to be
 * repeated in every screen.
 */
function RootNavigator() {
  const {session, isLoading} = useSession();

  // Render nothing until the keychain read finishes, so a signed-in user is
  // never flashed the sign-in screen on launch.
  if (isLoading) return null;

  return (
    <Stack screenOptions={{headerShown: false}}>
      <Stack.Protected guard={session !== null}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={session === null}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </SessionProvider>
  );
}
