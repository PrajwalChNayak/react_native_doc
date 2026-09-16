import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { findPost } from '../data/posts';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';

export type PostDetailsScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'PostDetails'
>;

export function PostDetailsScreen({
  navigation,
  route,
}: PostDetailsScreenProps) {
  // `route.params` is typed as `{ postId: string }` — no cast, no `any`.
  const post = findPost(route.params.postId);

  if (!post) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Post not found</Text>
        <Text style={styles.body}>
          A deep link asked for post “{route.params.postId}”, which does not
          exist. Handle this case: params that arrive from a URL are attacker
          controlled and will not always match your data.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{post.title}</Text>
      <Text style={styles.body}>{post.body}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          navigation.navigate('Profile', { userId: post.authorId })
        }
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={styles.buttonLabel}>View {post.author}’s profile</Text>
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
