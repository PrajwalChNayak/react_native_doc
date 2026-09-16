import {Link} from 'expo-router';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';

import {POSTS} from '@/lib/posts';

export default function PostsScreen() {
  return (
    <View style={styles.screen}>
      <FlatList
        data={POSTS}
        keyExtractor={(post) => post.id}
        contentContainerStyle={styles.list}
        renderItem={({item}) => (
          // Object hrefs keep the dynamic segment and its params separate. With
          // typedRoutes on, a typo in the pathname is a compile error once the
          // route types have been generated.
          <Link href={{pathname: '/posts/[id]', params: {id: item.id}}} asChild>
            <Pressable style={styles.row} accessibilityRole="link">
              <Text style={styles.title}>{item.title}</Text>
            </Pressable>
          </Link>
        )}
        ListFooterComponent={
          <Link href="/modal" style={styles.modalLink}>
            About this example
          </Link>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1},
  list: {padding: 16, gap: 8},
  row: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#f1f3f5',
  },
  title: {fontSize: 16, fontWeight: '600'},
  modalLink: {marginTop: 16, color: '#0a58ca', fontSize: 15},
});
