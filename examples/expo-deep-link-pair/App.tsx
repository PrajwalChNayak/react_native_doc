import * as Linking from 'expo-linking';
import {StatusBar} from 'expo-status-bar';
import {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';

import {resolveFixed} from './src/fixed';
import type {LinkAction} from './src/parse';
import {resolveVulnerable} from './src/vulnerable';

/**
 * Shows what each handler would do with the link that opened the app. Open it
 * with, for example:
 *
 *   npx uri-scheme open "expodeeplink://login?next=https://evil.example" --android
 *
 * Nothing here actually navigates or opens a URL — the point is to see the two
 * decisions side by side.
 */
function describe(action: LinkAction): string {
  switch (action.type) {
    case 'navigate':
      return `navigate to ${action.to}`;
    case 'openExternal':
      return `OPEN EXTERNAL ${action.url}`;
    case 'ignore':
      return 'ignore';
  }
}

export default function App() {
  const url = Linking.useLinkingURL();
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  useEffect(() => {
    if (url) setLastUrl(url);
  }, [url]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Deep link handling</Text>
      <Text style={styles.label}>Incoming link</Text>
      <Text style={styles.value}>{lastUrl ?? '(open the app from a link)'}</Text>

      {lastUrl ? (
        <View style={styles.pair}>
          <Text style={styles.label}>Vulnerable handler</Text>
          <Text style={[styles.value, styles.bad]}>{describe(resolveVulnerable(lastUrl))}</Text>
          <Text style={styles.label}>Fixed handler</Text>
          <Text style={[styles.value, styles.good]}>{describe(resolveFixed(lastUrl))}</Text>
        </View>
      ) : null}

      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {padding: 24, paddingTop: 72, gap: 8},
  title: {fontSize: 20, fontWeight: '700', marginBottom: 12},
  pair: {marginTop: 16, gap: 8},
  label: {fontSize: 12, fontWeight: '600', color: '#5b6570'},
  value: {fontSize: 15, fontFamily: 'monospace'},
  bad: {color: '#b3261e'},
  good: {color: '#0f7048'},
});
