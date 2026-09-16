import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { POSTS, type Post } from '../data/posts';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { colors } from '../theme';

/**
 * A screen inside a tab navigator that also pushes onto the parent stack needs
 * `CompositeScreenProps`. With only `BottomTabScreenProps` the call to
 * `navigate('PostDetails', ...)` would not type-check, because `PostDetails`
 * is not a route of the tab navigator.
 */
export type FeedScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Feed'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function FeedScreen({ navigation }: FeedScreenProps) {
  const renderItem = ({ item }: { item: Post }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => navigation.navigate('PostDetails', { postId: item.id })}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Text style={styles.rowTitle}>{item.title}</Text>
      <Text style={styles.rowMeta}>by {item.author}</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={POSTS}
        keyExtractor={post => post.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  row: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    gap: 4,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  rowMeta: {
    fontSize: 13,
    color: colors.muted,
  },
});
