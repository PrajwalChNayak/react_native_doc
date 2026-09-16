import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { postUrl, profileUrl } from '../navigation/linking';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { colors } from '../theme';

export type SettingsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Settings'>,
  NativeStackScreenProps<RootStackParamList>
>;

const LINKS: readonly { label: string; url: string }[] = [
  { label: 'Open post 2', url: postUrl('2') },
  { label: 'Open Grace’s profile', url: profileUrl('grace') },
  {
    label: 'Open Ada’s profile, highlighting a section',
    url: profileUrl('ada', 'new architecture'),
  },
  { label: 'Open the Feed tab', url: 'rnhandbook://feed' },
];

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Deep links</Text>
      <Text style={styles.body}>
        These call `Linking.openURL` on the app’s own scheme, which is the same
        path the OS takes when a link arrives from outside. React Navigation
        turns the URL into navigation state using the config in
        `src/navigation/linking.ts`.
      </Text>

      {LINKS.map(link => (
        <Pressable
          accessibilityRole="button"
          key={link.url}
          onPress={() => {
            void Linking.openURL(link.url);
          }}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonLabel}>{link.label}</Text>
          <Text style={styles.buttonUrl}>{link.url}</Text>
        </Pressable>
      ))}

      <Text style={styles.heading}>Typed navigation</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          navigation.navigate('Profile', {
            userId: 'alan',
            highlight: 'typed routes',
          })
        }
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={styles.buttonLabel}>navigate(&apos;Profile&apos;, …)</Text>
        <Text style={styles.buttonUrl}>
          Params are checked at compile time
        </Text>
      </Pressable>
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
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
  },
  body: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
  },
  pressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
  },
  buttonUrl: {
    fontSize: 12,
    color: colors.muted,
  },
});
