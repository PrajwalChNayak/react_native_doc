import {Link, Stack} from 'expo-router';
import {StyleSheet, Text, View} from 'react-native';

/** Matches any URL no route handles, including a malformed deep link. */
export default function NotFound() {
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{title: 'Not found'}} />
      <Text style={styles.body}>This screen does not exist.</Text>
      <Link href="/" style={styles.link}>
        Go to the posts list
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12},
  body: {fontSize: 16},
  link: {color: '#0a58ca', fontSize: 15},
});
