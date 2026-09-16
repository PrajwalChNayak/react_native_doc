/**
 * Native stack + bottom tabs with typed routes and deep linking.
 *
 * React Native 0.87.1, New Architecture, Strict TypeScript API.
 */

import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from './src/navigation/RootNavigator';
import { linking } from './src/navigation/linking';

function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer
        linking={linking}
        // Rendered while the container resolves the initial deep link. Without
        // it you briefly see the default route before the linked route
        // replaces it.
        fallback={
          <View style={styles.fallback}>
            <ActivityIndicator />
          </View>
        }>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default App;
