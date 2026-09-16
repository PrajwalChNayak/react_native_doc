import {Stack, useLocalSearchParams} from 'expo-router';
import {StyleSheet, Text, View} from 'react-native';

import {findPost} from '@/lib/posts';

/**
 * A dynamic route. `id` comes from the URL, which means it can come from a deep
 * link someone else crafted. `findPost` validates its shape before looking it
 * up, and an unknown or malformed id renders a plain not-found state rather than
 * being passed anywhere else.
 */
export default function PostScreen() {
  const {id} = useLocalSearchParams();
  const post = findPost(id);

  if (!post) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{title: 'Not found'}} />
        <Text style={styles.body}>That post does not exist.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{title: post.title}} />
      <Text style={styles.title}>{post.title}</Text>
      <Text style={styles.body}>{post.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, padding: 16, gap: 12},
  title: {fontSize: 22, fontWeight: '700'},
  body: {fontSize: 16, lineHeight: 24},
});
