import * as Linking from 'expo-linking';
import {StyleSheet, Text, View} from 'react-native';

/**
 * Shows the deep link for a post. `createURL` uses the app config `scheme` in a
 * development or production build, and an Expo Go-specific URL when running
 * inside Expo Go — so the printed value differs between the two.
 */
export default function SettingsScreen() {
  const postLink = Linking.createURL('/posts/2');

  return (
    <View style={styles.screen}>
      <Text style={styles.label}>Deep link to post 2</Text>
      <Text selectable style={styles.value}>
        {postLink}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, padding: 16, gap: 8},
  label: {fontSize: 13, fontWeight: '600', color: '#5b6570'},
  value: {fontSize: 15, fontFamily: 'monospace'},
});
