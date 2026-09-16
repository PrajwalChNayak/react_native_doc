/**
 * A real render test: it mounts the whole component tree through
 * react-test-renderer, which catches broken JSX, bad style objects and hook
 * ordering problems that a pure unit test cannot see.
 *
 * `initialMetrics` is passed so `useSafeAreaInsets()` resolves immediately.
 * Without it `SafeAreaProvider` waits for a native inset event that never
 * arrives in a test environment and renders nothing.
 */

import ReactTestRenderer from 'react-test-renderer';
import {
  SafeAreaProvider,
  type Metrics,
} from 'react-native-safe-area-context';

import { AppContent } from '../App';

const TEST_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

test('renders the app without throwing', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <AppContent />
      </SafeAreaProvider>,
    );
  });

  const json = tree?.toJSON();
  expect(json).toBeTruthy();

  const rendered = JSON.stringify(json);
  expect(rendered).toContain('Minimal App');
  expect(rendered).toContain('History (newest first)');
  // The counter starts at zero and the step chips are rendered.
  expect(rendered).toContain('Step size: ');

  await ReactTestRenderer.act(() => {
    tree?.unmount();
  });
});
