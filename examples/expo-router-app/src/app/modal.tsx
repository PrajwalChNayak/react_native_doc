import {router} from 'expo-router';
import {Pressable, StyleSheet, Text, View} from 'react-native';

/** Presented modally because the root layout sets `presentation: 'modal'`. */
export default function AboutModal() {
  return (
    <View style={styles.screen}>
      <Text style={styles.body}>
        Expo SDK 57 · React Native 0.86.3 · expo-router 57.0.21
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.button}>
        <Text style={styles.buttonText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, padding: 24, gap: 16, justifyContent: 'center'},
  body: {fontSize: 16, textAlign: 'center'},
  button: {
    alignSelf: 'center',
    backgroundColor: '#0a58ca',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  buttonText: {color: '#fff', fontWeight: '600'},
});
