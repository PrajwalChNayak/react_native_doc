import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';

/**
 * The root layout. Its children are rendered as a native stack:
 *
 *   (tabs)      a group — the parentheses keep it out of the URL
 *   posts/[id]  a dynamic route pushed on top of the tabs
 *   modal       presented modally
 */
export default function RootLayout() {
  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{headerShown: false}} />
        <Stack.Screen name="posts/[id]" options={{title: 'Post'}} />
        <Stack.Screen name="modal" options={{presentation: 'modal', title: 'About'}} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
