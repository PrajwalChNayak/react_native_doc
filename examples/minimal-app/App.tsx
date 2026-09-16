/**
 * Minimal React Native 0.87 app — New Architecture, Strict TypeScript API.
 *
 * Everything here imports from the `react-native` package root. Deep imports
 * such as `react-native/Libraries/...` are type errors in 0.87.
 */

import { useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { CounterCard } from './src/components/CounterCard';
import { getTheme } from './src/theme';
import { useCounter } from './src/useCounter';

/**
 * Exported separately so tests can mount it inside a `SafeAreaProvider` with
 * explicit `initialMetrics`, which makes insets deterministic without a native
 * module.
 */
export function AppContent() {
  const scheme = useColorScheme();
  const theme = getTheme(scheme);
  const insets = useSafeAreaInsets();
  const { state, increment, decrement, setStep, reset } = useCounter();
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      {/* `backgroundColor` and `translucent` were removed from StatusBar in
          0.87; `barStyle` is still supported. */}
      <StatusBar
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
        ]}>
        <Text style={[styles.title, { color: theme.text }]}>Minimal App</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          React Native 0.87.1 · New Architecture · Strict TypeScript API
        </Text>

        <CounterCard
          count={state.count}
          step={state.step}
          theme={theme}
          onIncrement={increment}
          onDecrement={decrement}
          onReset={reset}
          onMeasured={setMeasuredHeight}
        />

        <View style={styles.stepRow}>
          {[1, 5, 25].map(step => (
            <Text
              accessibilityRole="button"
              key={step}
              onPress={() => setStep(step)}
              style={[
                styles.stepChip,
                {
                  color: state.step === step ? theme.accent : theme.muted,
                  borderColor:
                    state.step === step ? theme.accent : theme.border,
                },
              ]}>
              step {step}
            </Text>
          ))}
        </View>

        {measuredHeight !== null ? (
          <Text style={[styles.note, { color: theme.muted }]}>
            Card height measured natively: {Math.round(measuredHeight)}dp
          </Text>
        ) : (
          <Text style={[styles.note, { color: theme.muted }]}>
            Press “Measure” to read the card height through a ViewInstance ref.
          </Text>
        )}

        <Text style={[styles.historyTitle, { color: theme.text }]}>
          History (newest first)
        </Text>
        <Text style={[styles.history, { color: theme.muted }]}>
          {state.history.join(' · ')}
        </Text>
      </ScrollView>
    </View>
  );
}

function App() {
  // `SafeAreaView` from `react-native` is deprecated and warns at runtime in
  // 0.87. `react-native-safe-area-context` is the supported replacement and is
  // what the official 0.87 template ships with.
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stepChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    fontSize: 14,
    overflow: 'hidden',
  },
  note: {
    fontSize: 13,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  history: {
    fontSize: 14,
  },
});

export default App;
