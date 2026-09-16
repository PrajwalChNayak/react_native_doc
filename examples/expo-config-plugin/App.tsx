import Constants from 'expo-constants';
import {StatusBar} from 'expo-status-bar';
import {StyleSheet, Text, View} from 'react-native';

/**
 * The interesting part of this example is not the UI — it is what
 * `plugins/withExampleNativeConfig.js` does to the generated native projects.
 * See README.md and generated-output/.
 */
export default function App() {
  const plugins = Constants.expoConfig?.plugins ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Config plugin example</Text>
      <Text style={styles.body}>
        {plugins.length} plugin(s) in the app config. Run `npm run prebuild:scratch` to see the
        native files they generate.
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12},
  title: {fontSize: 20, fontWeight: '700'},
  body: {fontSize: 15, textAlign: 'center', lineHeight: 22},
});
