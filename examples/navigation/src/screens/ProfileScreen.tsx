import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text } from 'react-native';

import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';

export type ProfileScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Profile'
>;

export function ProfileScreen({ route }: ProfileScreenProps) {
  const { userId, highlight } = route.params;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>@{userId}</Text>
      <Text style={styles.body}>
        This screen was reached either by `navigate(&apos;Profile&apos;, …)` or
        by a deep link matching `user/:userId`.
      </Text>
      {highlight !== undefined ? (
        <Text style={styles.highlight}>Highlight: {highlight}</Text>
      ) : (
        <Text style={styles.body}>No highlight query parameter was set.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  highlight: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
  },
});
